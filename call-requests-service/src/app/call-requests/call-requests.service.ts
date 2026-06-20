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
  DEFAULT_EVENT_TYPE_SLOT_INTERVAL_MINUTES,
  DEFAULT_EVENT_TYPE_TIMEZONE,
  DEFAULT_EVENT_TYPE_WORKDAY_END_HOUR,
  DEFAULT_EVENT_TYPE_WORKDAY_START_HOUR,
  type EventTypeDocument,
} from '../hosts/event-type.schema';
import {
  getBookingTimeValidationError,
  isWeekend,
  SLOT_INTERVAL_MINUTES,
} from './call-request-booking-rules';
import { ACTIVE_RESERVATION_STATUSES } from './call-request-status-rules';
import { createCancellationToken } from './call-request-tokens';
import { normalizeCreateCallRequestInput } from './create-call-request-input';
import {
  CALENDAR_PROVIDER,
  type CalendarProvider,
} from '../calendar/calendar-provider';
import { EventTypesService } from '../hosts/event-types.service';

interface AvailabilityRules {
  timezone: string;
  workdayStartHour: number;
  workdayEndHour: number;
  slotIntervalMinutes: number;
  durationMinutes: number;
  minimumNoticeMinutes?: number;
  maxFutureDays?: number;
}

export interface CallRequestPublicBookingResponse extends CallRequestResponseDto {
  cancellationToken: string;
}

export interface RescheduleCallRequestDto {
  scheduledAt: string;
}

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
    const availabilityRules = await this.getDefaultAvailabilityRules();

    const callRequest = await this.createWithRules(
      { email, phoneNumber, scheduledAt },
      availabilityRules,
    );

    return this.toResponse(callRequest);
  }

  async createForEventType(
    dto: CreateCallRequestDto,
    eventType: EventTypeDocument,
  ): Promise<CallRequestPublicBookingResponse> {
    const { email, phoneNumber, scheduledAt } = this.normalizeCreateInput(dto);

    const callRequest = await this.createWithRules(
      { email, phoneNumber, scheduledAt },
      getAvailabilityRules(eventType),
    );

    return this.toPublicBookingResponse(callRequest);
  }

  private async createWithRules(
    input: {
      email: string;
      phoneNumber: string;
      scheduledAt: Date;
    },
    availabilityRules: AvailabilityRules,
  ): Promise<CallRequestDocument> {
    const { email, phoneNumber, scheduledAt } = input;

    this.validateScheduledAt(scheduledAt, availabilityRules);

    await this.assertSlotAvailable(scheduledAt);

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

    return callRequest;
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

  private validateScheduledAt(
    scheduledAt: Date,
    availabilityRules: AvailabilityRules,
  ): void {
    const validationError = getBookingTimeValidationError(
      scheduledAt,
      undefined,
      {
        timezone: availabilityRules.timezone,
        workdayStartHour: availabilityRules.workdayStartHour,
        workdayEndHour: availabilityRules.workdayEndHour,
        slotIntervalMinutes: availabilityRules.slotIntervalMinutes,
        minimumNoticeMinutes: availabilityRules.minimumNoticeMinutes,
        maxFutureDays: availabilityRules.maxFutureDays,
      },
    );

    if (validationError) {
      throw new BadRequestException(validationError);
    }
  }

  private normalizeRescheduleInput(dto: RescheduleCallRequestDto): Date {
    const scheduledAtRaw = dto.scheduledAt?.trim();

    if (!scheduledAtRaw) {
      throw new BadRequestException('scheduledAt is required');
    }

    const scheduledAt = new Date(scheduledAtRaw);

    if (Number.isNaN(scheduledAt.getTime())) {
      throw new BadRequestException('scheduledAt must be a valid date');
    }

    return scheduledAt;
  }

  private async assertSlotAvailable(
    scheduledAt: Date,
    excludeCallRequestId?: string,
  ): Promise<void> {
    const query: {
      scheduledAt: Date;
      status: {
        $in: CallRequestStatus[];
      };
      _id?: {
        $ne: string;
      };
    } = {
      scheduledAt,
      status: {
        $in: ACTIVE_RESERVATION_STATUSES,
      },
    };

    if (excludeCallRequestId) {
      query._id = {
        $ne: excludeCallRequestId,
      };
    }

    const existingCallRequest = await this.callRequestModel.exists(query);

    if (existingCallRequest) {
      throw new BadRequestException('This time slot is already reserved');
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
        cancellationToken: createCancellationToken(),
      });
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new BadRequestException('This time slot is already reserved');
      }

      throw error;
    }
  }

  async getAvailability(date: string): Promise<AvailabilitySlotDto[]> {
    const availabilityRules = await this.getDefaultAvailabilityRules();

    return this.getAvailabilityWithRules(date, availabilityRules);
  }

  async getAvailabilityForEventType(
    date: string,
    eventType: EventTypeDocument,
  ): Promise<AvailabilitySlotDto[]> {
    return this.getAvailabilityWithRules(date, getAvailabilityRules(eventType));
  }

  private async getAvailabilityWithRules(
    date: string,
    availabilityRules: AvailabilityRules,
  ): Promise<AvailabilitySlotDto[]> {
    const day = DateTime.fromISO(date, {
      zone: availabilityRules.timezone,
    });

    if (!day.isValid) {
      throw new BadRequestException('date must be a valid ISO date');
    }

    const nowInTimezone = DateTime.now().setZone(availabilityRules.timezone);

    if (
      day.hasSame(nowInTimezone, 'day') ||
      day < nowInTimezone.startOf('day')
    ) {
      throw new BadRequestException(
        'Availability is only available for future dates',
      );
    }

    if (isWeekend(day)) {
      return [];
    }

    const { startOfWorkingDay, endOfWorkingDay } = this.getWorkingDayBounds(
      day,
      availabilityRules,
    );

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
        minutes: availabilityRules.durationMinutes,
      });

      slots.push({
        scheduledAt,
        available: !this.hasAvailabilityConflict({
          slotStartsAt,
          slotEndsAt,
          localReservations: existingCallRequests,
          externalBusySlots,
          reservationDurationMinutes: availabilityRules.durationMinutes,
        }),
      });

      currentSlot = currentSlot.plus({
        minutes: availabilityRules.slotIntervalMinutes,
      });
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
    const availabilityRules = await this.getDefaultAvailabilityRules();

    await this.calendarProvider.createEvent({
      title: `Call with ${callRequest.email}`,
      startsAt: callRequest.scheduledAt.toISOString(),
      endsAt: this.getCallEndsAt(
        callRequest.scheduledAt,
        availabilityRules.durationMinutes,
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

    return this.cancelCallRequest(callRequest);
  }

  async cancelWithToken(
    id: string,
    cancellationToken: string,
  ): Promise<CallRequestResponseDto> {
    const callRequest = await this.callRequestModel
      .findOne({
        _id: id,
        cancellationToken,
      })
      .exec();

    if (!callRequest) {
      throw new NotFoundException('Call request not found');
    }

    return this.cancelCallRequest(callRequest);
  }

  async rescheduleWithToken(
    id: string,
    cancellationToken: string,
    dto: RescheduleCallRequestDto,
    eventType: EventTypeDocument,
  ): Promise<CallRequestPublicBookingResponse> {
    const callRequest = await this.callRequestModel
      .findOne({
        _id: id,
        cancellationToken,
      })
      .exec();

    if (!callRequest) {
      throw new NotFoundException('Call request not found');
    }

    if (callRequest.status !== CallRequestStatus.REQUESTED) {
      throw new ConflictException('Only requested calls can be rescheduled');
    }

    const scheduledAt = this.normalizeRescheduleInput(dto);
    const availabilityRules = getAvailabilityRules(eventType);

    this.validateScheduledAt(scheduledAt, availabilityRules);
    await this.assertSlotAvailable(scheduledAt, callRequest.id);

    callRequest.scheduledAt = scheduledAt;

    try {
      await callRequest.save();
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new BadRequestException('This time slot is already reserved');
      }

      throw error;
    }

    return this.toPublicBookingResponse(callRequest);
  }

  private async cancelCallRequest(
    callRequest: CallRequestDocument,
  ): Promise<CallRequestResponseDto> {
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

  private toPublicBookingResponse(
    callRequest: CallRequestDocument,
  ): CallRequestPublicBookingResponse {
    return {
      ...this.toResponse(callRequest),
      cancellationToken: callRequest.cancellationToken,
    };
  }

  private async getDefaultAvailabilityRules(): Promise<AvailabilityRules> {
    const eventType = await this.eventTypesService.findDefaultActiveEventType();

    return getAvailabilityRules(eventType);
  }

  private getWorkingDayBounds(
    day: DateTime,
    availabilityRules: AvailabilityRules,
  ): {
    startOfWorkingDay: DateTime;
    endOfWorkingDay: DateTime;
  } {
    return {
      startOfWorkingDay: day.set({
        hour: availabilityRules.workdayStartHour,
        minute: 0,
        second: 0,
        millisecond: 0,
      }),
      endOfWorkingDay: day.set({
        hour: availabilityRules.workdayEndHour,
        minute: 0,
        second: 0,
        millisecond: 0,
      }),
    };
  }

  private hasAvailabilityConflict(input: {
    slotStartsAt: DateTime;
    slotEndsAt: DateTime;
    localReservations: Array<{ scheduledAt: Date }>;
    externalBusySlots: Array<{ startsAt: string; endsAt: string }>;
    reservationDurationMinutes: number;
  }): boolean {
    const localConflict = input.localReservations.some((callRequest) => {
      const startsAt = DateTime.fromJSDate(callRequest.scheduledAt);
      const endsAt = startsAt.plus({
        minutes: input.reservationDurationMinutes,
      });

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

function getAvailabilityRules(
  eventType: EventTypeDocument | null,
): AvailabilityRules {
  return {
    timezone: eventType?.availabilityTimezone ?? DEFAULT_EVENT_TYPE_TIMEZONE,
    workdayStartHour:
      eventType?.workdayStartHour ?? DEFAULT_EVENT_TYPE_WORKDAY_START_HOUR,
    workdayEndHour:
      eventType?.workdayEndHour ?? DEFAULT_EVENT_TYPE_WORKDAY_END_HOUR,
    slotIntervalMinutes:
      eventType?.slotIntervalMinutes ??
      DEFAULT_EVENT_TYPE_SLOT_INTERVAL_MINUTES,
    durationMinutes: eventType?.durationMinutes ?? SLOT_INTERVAL_MINUTES,
    minimumNoticeMinutes: eventType?.minimumNoticeMinutes,
    maxFutureDays: eventType?.maxFutureDays,
  };
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 11000
  );
}
