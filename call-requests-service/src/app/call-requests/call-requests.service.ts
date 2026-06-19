import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  AvailabilitySlotDto,
  CallApprovedEvent,
  CallCanceledEvent,
  CallRejectedEvent,
  CallRequestedEvent,
  CallRequestResponseDto,
  CallRequestStatus,
  CreateCallRequestDto,
  RabbitmqRoutingKey,
  UpdateAdminNoteDto,
} from '@org/shared-types';
import { CallRequest, CallRequestDocument } from './call-request.schema';
import { DateTime } from 'luxon';
import { RabbitmqPublisherService } from '../messaging/rabbitmq-publisher.service';
import {
  getBookingTimeValidationError,
  getWorkingDayBounds,
  ISTANBUL_TIME_ZONE,
  isWeekend,
  SLOT_INTERVAL_MINUTES,
} from './call-request-booking-rules';
import { ACTIVE_RESERVATION_STATUSES } from './call-request-status-rules';
import { normalizeCreateCallRequestInput } from './create-call-request-input';
import {
  CALENDAR_PROVIDER,
  type CalendarProvider,
} from '../calendar/calendar-provider';
import { EventTypesService } from '../hosts/event-types.service';

@Injectable()
export class CallRequestsService {
  constructor(
    @InjectModel(CallRequest.name)
    private readonly callRequestModel: Model<CallRequestDocument>,
    private readonly rabbitmqPublisherService: RabbitmqPublisherService,
    @Inject(CALENDAR_PROVIDER)
    private readonly calendarProvider: CalendarProvider,
    private readonly eventTypesService: EventTypesService,
  ) {}

  async create(dto: CreateCallRequestDto) {
    const { email, phoneNumber, scheduledAt } = this.normalizeCreateInput(dto);

    this.validateScheduledAt(scheduledAt);

    const existingCallRequest = await this.callRequestModel.exists({
      scheduledAt,
      status: {
        $in: ACTIVE_RESERVATION_STATUSES,
      },
    });

    if (existingCallRequest) {
      throw new BadRequestException('This time slot is already reserved');
    }

    const callRequest = await this.createCallRequest({
      email,
      phoneNumber,
      scheduledAt,
    });

    const event: CallRequestedEvent = {
      callRequestId: callRequest.id,
      email: callRequest.email,
      phoneNumber: callRequest.phoneNumber,
      scheduledAt: callRequest.scheduledAt.toISOString(),
    };

    await this.rabbitmqPublisherService.publish(
      RabbitmqRoutingKey.CALL_REQUESTED,
      event,
    );

    return this.toResponse(callRequest);
  }

  private normalizeCreateInput(
    dto: CreateCallRequestDto,
  ): ReturnType<typeof normalizeCreateCallRequestInput> {
    try {
      return normalizeCreateCallRequestInput(dto);
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Invalid call request',
      );
    }
  }

  private validateScheduledAt(scheduledAt: Date): void {
    const validationError = getBookingTimeValidationError(scheduledAt);

    if (validationError) {
      throw new BadRequestException(validationError);
    }
  }

  private async createCallRequest(dto: {
    email: string;
    phoneNumber: string;
    scheduledAt: Date;
  }): Promise<CallRequestDocument> {
    try {
      return await this.callRequestModel.create({
        ...dto,
        status: CallRequestStatus.REQUESTED,
      });
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new BadRequestException('This time slot is already reserved');
      }

      throw error;
    }
  }

  async getAvailability(date: string): Promise<AvailabilitySlotDto[]> {
    const day = DateTime.fromISO(date, {
      zone: ISTANBUL_TIME_ZONE,
    });

    if (!day.isValid) {
      throw new BadRequestException('date must be a valid ISO date');
    }

    const nowInIstanbul = DateTime.now().setZone(ISTANBUL_TIME_ZONE);

    if (
      day.hasSame(nowInIstanbul, 'day') ||
      day < nowInIstanbul.startOf('day')
    ) {
      throw new BadRequestException(
        'Availability is only available for future dates',
      );
    }

    if (isWeekend(day)) {
      return [];
    }

    const eventDurationMinutes = await this.getDefaultEventDurationMinutes();
    const { startOfWorkingDay, endOfWorkingDay } = getWorkingDayBounds(day);

    const existingCallRequests = await this.callRequestModel
      .find({
        scheduledAt: {
          $gte: startOfWorkingDay.toUTC().toJSDate(),
          $lt: endOfWorkingDay.toUTC().toJSDate(),
        },
        status: {
          $in: ACTIVE_RESERVATION_STATUSES,
        },
      })
      .select('scheduledAt')
      .lean();

    const externalBusySlots = await this.calendarProvider.getBusySlots({
      from: startOfWorkingDay.toUTC().toISO() ?? '',
      to: endOfWorkingDay.toUTC().toISO() ?? '',
    });

    const slots: AvailabilitySlotDto[] = [];

    let currentSlot = startOfWorkingDay;

    while (currentSlot < endOfWorkingDay) {
      const scheduledAt = currentSlot.toUTC().toJSDate().toISOString();
      const slotStartsAt = currentSlot.toUTC();
      const slotEndsAt = slotStartsAt.plus({
        minutes: eventDurationMinutes,
      });

      slots.push({
        scheduledAt,
        available: !this.hasAvailabilityConflict({
          slotStartsAt,
          slotEndsAt,
          localReservations: existingCallRequests,
          externalBusySlots,
        }),
      });

      currentSlot = currentSlot.plus({ minutes: SLOT_INTERVAL_MINUTES });
    }

    return slots;
  }

  async findAll(): Promise<CallRequestResponseDto[]> {
    const callRequests = await this.callRequestModel
      .find()
      .sort({ scheduledAt: 1 })
      .exec();

    return callRequests.map((callRequest) => this.toResponse(callRequest));
  }

  async approve(id: string): Promise<CallRequestResponseDto> {
    const callRequest = await this.callRequestModel.findById(id).exec();

    if (!callRequest) {
      throw new NotFoundException('Call request not found');
    }

    if (callRequest.status !== CallRequestStatus.REQUESTED) {
      throw new ConflictException('Only requested calls can be approved');
    }

    callRequest.status = CallRequestStatus.SCHEDULED;
    await callRequest.save();
    const eventDurationMinutes = await this.getDefaultEventDurationMinutes();

    await this.calendarProvider.createEvent({
      title: `Call with ${callRequest.email}`,
      startsAt: callRequest.scheduledAt.toISOString(),
      endsAt: this.getCallEndsAt(
        callRequest.scheduledAt,
        eventDurationMinutes,
      ).toISOString(),
      attendeeEmail: callRequest.email,
      attendeePhoneNumber: callRequest.phoneNumber,
    });

    const event: CallApprovedEvent = {
      callRequestId: callRequest.id,
      email: callRequest.email,
      phoneNumber: callRequest.phoneNumber,
      scheduledAt: callRequest.scheduledAt.toISOString(),
    };

    await this.rabbitmqPublisherService.publish(
      RabbitmqRoutingKey.CALL_APPROVED,
      event,
    );

    return this.toResponse(callRequest);
  }

  async reject(id: string): Promise<CallRequestResponseDto> {
    const callRequest = await this.callRequestModel.findById(id).exec();

    if (!callRequest) {
      throw new NotFoundException('Call request not found');
    }

    if (callRequest.status !== CallRequestStatus.REQUESTED) {
      throw new ConflictException('Only requested calls can be rejected');
    }

    callRequest.status = CallRequestStatus.REJECTED;
    await callRequest.save();

    const event: CallRejectedEvent = {
      callRequestId: callRequest.id,
      email: callRequest.email,
    };

    await this.rabbitmqPublisherService.publish(
      RabbitmqRoutingKey.CALL_REJECTED,
      event,
    );

    return this.toResponse(callRequest);
  }

  async markAsCalled(id: string): Promise<CallRequestResponseDto> {
    const callRequest = await this.callRequestModel.findById(id).exec();

    if (!callRequest) {
      throw new NotFoundException('Call request not found');
    }

    if (callRequest.status !== CallRequestStatus.SCHEDULED) {
      throw new ConflictException(
        'Only scheduled calls can be marked as called',
      );
    }

    callRequest.status = CallRequestStatus.CALLED;
    await callRequest.save();

    return this.toResponse(callRequest);
  }

  async cancel(id: string): Promise<CallRequestResponseDto> {
    const callRequest = await this.callRequestModel.findById(id).exec();

    if (!callRequest) {
      throw new NotFoundException('Call request not found');
    }

    if (callRequest.status !== CallRequestStatus.SCHEDULED) {
      throw new ConflictException('Only scheduled calls can be canceled');
    }

    callRequest.status = CallRequestStatus.CANCELED;
    await callRequest.save();

    const event: CallCanceledEvent = {
      callRequestId: callRequest.id,
      email: callRequest.email,
      scheduledAt: callRequest.scheduledAt.toISOString(),
    };

    await this.rabbitmqPublisherService.publish(
      RabbitmqRoutingKey.CALL_CANCELED,
      event,
    );

    return this.toResponse(callRequest);
  }

  async updateAdminNote(
    id: string,
    dto: UpdateAdminNoteDto,
  ): Promise<CallRequestResponseDto> {
    const callRequest = await this.callRequestModel.findById(id).exec();

    if (!callRequest) {
      throw new NotFoundException('Call request not found');
    }

    callRequest.adminNote = dto.adminNote;
    await callRequest.save();

    return this.toResponse(callRequest);
  }

  private toResponse(callRequest: CallRequestDocument): CallRequestResponseDto {
    return {
      id: callRequest.id,
      email: callRequest.email,
      phoneNumber: callRequest.phoneNumber,
      scheduledAt: callRequest.scheduledAt.toISOString(),
      status: callRequest.status,
      adminNote: callRequest.adminNote,
      createdAt: callRequest.createdAt.toISOString(),
      updatedAt: callRequest.updatedAt.toISOString(),
    };
  }

  private async getDefaultEventDurationMinutes(): Promise<number> {
    const eventType = await this.eventTypesService.findDefaultActiveEventType();

    return eventType?.durationMinutes ?? SLOT_INTERVAL_MINUTES;
  }

  private hasAvailabilityConflict(input: {
    slotStartsAt: DateTime;
    slotEndsAt: DateTime;
    localReservations: Array<{ scheduledAt: Date }>;
    externalBusySlots: Array<{ startsAt: string; endsAt: string }>;
  }): boolean {
    const localConflict = input.localReservations.some((callRequest) => {
      const startsAt = DateTime.fromJSDate(callRequest.scheduledAt);
      const endsAt = startsAt.plus({ minutes: SLOT_INTERVAL_MINUTES });

      return rangesOverlap(
        input.slotStartsAt,
        input.slotEndsAt,
        startsAt,
        endsAt,
      );
    });

    if (localConflict) {
      return true;
    }

    return input.externalBusySlots.some((busySlot) => {
      const startsAt = DateTime.fromISO(busySlot.startsAt);
      const endsAt = DateTime.fromISO(busySlot.endsAt);

      return rangesOverlap(
        input.slotStartsAt,
        input.slotEndsAt,
        startsAt,
        endsAt,
      );
    });
  }

  private getCallEndsAt(startsAt: Date, durationMinutes: number): Date {
    return DateTime.fromJSDate(startsAt)
      .plus({ minutes: durationMinutes })
      .toJSDate();
  }
}

function rangesOverlap(
  firstStartsAt: DateTime,
  firstEndsAt: DateTime,
  secondStartsAt: DateTime,
  secondEndsAt: DateTime,
): boolean {
  return firstStartsAt < secondEndsAt && secondStartsAt < firstEndsAt;
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 11000
  );
}
