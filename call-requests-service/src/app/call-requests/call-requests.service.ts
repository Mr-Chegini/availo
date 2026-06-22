import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
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
  type CreateCalendarEventInput,
  type CalendarProvider,
} from '../calendar/calendar-provider';
import { EventTypesService } from '../hosts/event-types.service';
import { createStructuredLog } from '../logging/structured-log';

interface AvailabilityRules {
  timezone: string;
  workdayStartHour: number;
  workdayEndHour: number;
  slotIntervalMinutes: number;
  durationMinutes: number;
  meetingLocation?: string;
  minimumNoticeMinutes?: number;
  maxFutureDays?: number;
}

interface PublicBookingRouteContext {
  hostId: string;
  hostSlug: string;
  eventTypeSlug: string;
}

export interface CallRequestPublicBookingResponse extends CallRequestResponseDto {
  cancellationToken: string;
  meetingLocation?: string;
}

export interface RescheduleCallRequestDto {
  scheduledAt: string;
}

@Injectable()
export class CallRequestsService {
  private readonly logger = new Logger(CallRequestsService.name);

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

    const callRequest = await this.createRequestedWithRules(
      {
        email,
        phoneNumber,
        scheduledAt,
        meetingLocation: availabilityRules.meetingLocation,
      },
      availabilityRules,
    );

    return this.toResponse(callRequest);
  }

  async createForEventType(
    dto: CreateCallRequestDto,
    eventType: EventTypeDocument,
    hostSlug?: string,
  ): Promise<CallRequestPublicBookingResponse> {
    const { email, phoneNumber, scheduledAt } = this.normalizeCreateInput(dto);
    const availabilityRules = getAvailabilityRules(eventType);

    const callRequest =
      (eventType.requiresApproval ?? true)
        ? await this.createRequestedWithRules(
            {
              email,
              phoneNumber,
              scheduledAt,
              meetingLocation: availabilityRules.meetingLocation,
              publicBookingRoute: getPublicBookingRouteContext(
                eventType,
                hostSlug,
              ),
            },
            availabilityRules,
          )
        : await this.createScheduledWithRules(
            {
              email,
              phoneNumber,
              scheduledAt,
              meetingLocation: availabilityRules.meetingLocation,
              publicBookingRoute: getPublicBookingRouteContext(
                eventType,
                hostSlug,
              ),
            },
            availabilityRules,
          );

    return this.toPublicBookingResponse(callRequest);
  }

  private async createRequestedWithRules(
    input: {
      email: string;
      phoneNumber: string;
      scheduledAt: Date;
      meetingLocation?: string;
      publicBookingRoute?: PublicBookingRouteContext;
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
      meetingLocation: input.meetingLocation,
      publicBookingRoute: input.publicBookingRoute,
    });

    const event: CallRequestedEvent = {
      callRequestId: callRequest.id,
      email: callRequest.email,
      phoneNumber: callRequest.phoneNumber,
      scheduledAt: callRequest.scheduledAt.toISOString(),
    };
    const publicBooking = toPublicBookingEventContext(callRequest);

    if (publicBooking) {
      event.publicBooking = publicBooking;
    }

    await this.rabbitmqPublisherService.publish(
      RabbitmqRoutingKey.CALL_REQUESTED,
      event,
    );

    this.logger.log(
      createStructuredLog('call_request.requested', {
        callRequestId: callRequest.id,
        scheduledAt: callRequest.scheduledAt.toISOString(),
        hasPublicBooking: Boolean(publicBooking),
      }),
    );

    return callRequest;
  }

  private async createScheduledWithRules(
    input: {
      email: string;
      phoneNumber: string;
      scheduledAt: Date;
      meetingLocation?: string;
      publicBookingRoute?: PublicBookingRouteContext;
    },
    availabilityRules: AvailabilityRules,
  ): Promise<CallRequestDocument> {
    const { email, phoneNumber, scheduledAt } = input;

    this.validateScheduledAt(scheduledAt, availabilityRules);
    await this.assertSlotAvailable(scheduledAt);

    const calendarEvent = await this.calendarProvider.createEvent(
      this.toCalendarEventInput(input, availabilityRules.durationMinutes),
    );

    try {
      const callRequest = await this.createCallRequest({
        email,
        phoneNumber,
        scheduledAt,
        meetingLocation: input.meetingLocation,
        publicBookingRoute: input.publicBookingRoute,
        status: CallRequestStatus.SCHEDULED,
        calendarProviderEventId: calendarEvent.providerEventId,
      });

      await this.publishCallApproved(callRequest);

      this.logger.log(
        createStructuredLog('call_request.scheduled', {
          callRequestId: callRequest.id,
          scheduledAt: callRequest.scheduledAt.toISOString(),
          autoConfirmed: true,
          hasPublicBooking: Boolean(toPublicBookingEventContext(callRequest)),
          hasCalendarEvent: Boolean(callRequest.calendarProviderEventId),
        }),
      );

      return callRequest;
    } catch (error) {
      if (calendarEvent.providerEventId) {
        await this.calendarProvider.cancelEvent({
          providerEventId: calendarEvent.providerEventId,
        });
      }

      throw error;
    }
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
    meetingLocation?: string;
    publicBookingRoute?: PublicBookingRouteContext;
    status?: CallRequestStatus;
    calendarProviderEventId?: string;
  }): Promise<CallRequestDocument> {
    try {
      const createInput: {
        email: string;
        phoneNumber: string;
        scheduledAt: Date;
        status: CallRequestStatus;
        cancellationToken: string;
        calendarProviderEventId?: string;
        meetingLocation?: string;
        publicBookingHostId?: string;
        publicBookingHostSlug?: string;
        publicBookingEventTypeSlug?: string;
      } = {
        email: dto.email,
        phoneNumber: dto.phoneNumber,
        scheduledAt: dto.scheduledAt,
        status: dto.status ?? CallRequestStatus.REQUESTED,
        cancellationToken: createCancellationToken(),
      };

      if (dto.calendarProviderEventId) {
        createInput.calendarProviderEventId = dto.calendarProviderEventId;
      }

      if (dto.meetingLocation) {
        createInput.meetingLocation = dto.meetingLocation;
      }

      if (dto.publicBookingRoute) {
        createInput.publicBookingHostId = dto.publicBookingRoute.hostId;
        createInput.publicBookingHostSlug = dto.publicBookingRoute.hostSlug;
        createInput.publicBookingEventTypeSlug =
          dto.publicBookingRoute.eventTypeSlug;
      }

      return await this.callRequestModel.create(createInput);
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

    const availabilityRules = await this.getDefaultAvailabilityRules();

    const calendarEvent = await this.calendarProvider.createEvent(
      this.toCalendarEventInput(callRequest, availabilityRules.durationMinutes),
    );

    callRequest.status = CallRequestStatus.SCHEDULED;
    callRequest.calendarProviderEventId = calendarEvent.providerEventId;
    await callRequest.save();

    await this.publishCallApproved(callRequest);

    this.logger.log(
      createStructuredLog('call_request.approved', {
        callRequestId: callRequest.id,
        scheduledAt: callRequest.scheduledAt.toISOString(),
        hasPublicBooking: Boolean(toPublicBookingEventContext(callRequest)),
        hasCalendarEvent: Boolean(callRequest.calendarProviderEventId),
      }),
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

    this.logger.log(
      createStructuredLog('call_request.rejected', {
        callRequestId: callRequest.id,
      }),
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

    this.logger.log(
      createStructuredLog('call_request.called', {
        callRequestId: callRequest.id,
      }),
    );

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
    eventType?: EventTypeDocument,
  ): Promise<CallRequestResponseDto> {
    const callRequest = await this.findByPublicToken(
      id,
      cancellationToken,
      eventType,
    );

    return this.cancelCallRequest(callRequest);
  }

  async getPublicBookingWithToken(
    id: string,
    cancellationToken: string,
    eventType: EventTypeDocument,
  ): Promise<CallRequestPublicBookingResponse> {
    const callRequest = await this.findByPublicToken(
      id,
      cancellationToken,
      eventType,
    );

    return this.toPublicBookingResponse(callRequest);
  }

  async rescheduleWithToken(
    id: string,
    cancellationToken: string,
    dto: RescheduleCallRequestDto,
    eventType: EventTypeDocument,
  ): Promise<CallRequestPublicBookingResponse> {
    const callRequest = await this.findByPublicToken(
      id,
      cancellationToken,
      eventType,
    );

    const scheduledAt = this.normalizeRescheduleInput(dto);
    const availabilityRules = getAvailabilityRules(eventType);

    this.validateScheduledAt(scheduledAt, availabilityRules);
    await this.assertSlotAvailable(scheduledAt, callRequest.id);

    if (callRequest.status === CallRequestStatus.SCHEDULED) {
      await this.updateScheduledCallRequestCalendarEvent(
        callRequest,
        scheduledAt,
        availabilityRules.durationMinutes,
      );
    } else if (callRequest.status !== CallRequestStatus.REQUESTED) {
      throw new ConflictException(
        'Only requested or scheduled calls can be rescheduled',
      );
    }

    callRequest.scheduledAt = scheduledAt;

    try {
      await callRequest.save();
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new BadRequestException('This time slot is already reserved');
      }

      throw error;
    }

    this.logger.log(
      createStructuredLog('call_request.rescheduled', {
        callRequestId: callRequest.id,
        scheduledAt: callRequest.scheduledAt.toISOString(),
        status: callRequest.status,
        hasCalendarEvent: Boolean(callRequest.calendarProviderEventId),
      }),
    );

    return this.toPublicBookingResponse(callRequest);
  }

  private async updateScheduledCallRequestCalendarEvent(
    callRequest: CallRequestDocument,
    scheduledAt: Date,
    durationMinutes: number,
  ): Promise<void> {
    if (!callRequest.calendarProviderEventId) {
      throw new ConflictException(
        'Scheduled calls without calendar events cannot be rescheduled',
      );
    }

    await this.calendarProvider.updateEvent({
      ...this.toCalendarEventInput(
        {
          email: callRequest.email,
          phoneNumber: callRequest.phoneNumber,
          scheduledAt,
          meetingLocation: callRequest.meetingLocation,
        },
        durationMinutes,
      ),
      providerEventId: callRequest.calendarProviderEventId,
    });
  }

  private async findByPublicToken(
    id: string,
    cancellationToken: string,
    eventType?: EventTypeDocument,
  ): Promise<CallRequestDocument> {
    const query: {
      _id: string;
      cancellationToken: string;
      publicBookingHostId?: string;
      publicBookingEventTypeSlug?: string;
    } = {
      _id: id,
      cancellationToken,
    };

    if (eventType) {
      query.publicBookingHostId = eventType.hostId.toString();
      query.publicBookingEventTypeSlug = eventType.slug;
    }

    const callRequest = await this.callRequestModel.findOne(query).exec();

    if (!callRequest) {
      throw new NotFoundException('Call request not found');
    }

    return callRequest;
  }

  private async cancelCallRequest(
    callRequest: CallRequestDocument,
  ): Promise<CallRequestResponseDto> {
    if (callRequest.status !== CallRequestStatus.SCHEDULED) {
      throw new ConflictException('Only scheduled calls can be canceled');
    }

    const hadCalendarEvent = Boolean(callRequest.calendarProviderEventId);

    if (callRequest.calendarProviderEventId) {
      await this.calendarProvider.cancelEvent({
        providerEventId: callRequest.calendarProviderEventId,
      });
    }

    callRequest.status = CallRequestStatus.CANCELED;
    callRequest.calendarProviderEventId = undefined;
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

    this.logger.log(
      createStructuredLog('call_request.canceled', {
        callRequestId: callRequest.id,
        hadCalendarEvent,
      }),
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
      meetingLocation: callRequest.meetingLocation,
    };
  }

  private toCalendarEventInput(
    input: {
      email: string;
      phoneNumber: string;
      scheduledAt: Date;
      meetingLocation?: string;
    },
    durationMinutes: number,
  ): CreateCalendarEventInput {
    return {
      title: `Call with ${input.email}`,
      startsAt: input.scheduledAt.toISOString(),
      endsAt: this.getCallEndsAt(
        input.scheduledAt,
        durationMinutes,
      ).toISOString(),
      attendeeEmail: input.email,
      attendeePhoneNumber: input.phoneNumber,
      location: input.meetingLocation,
    };
  }

  private async publishCallApproved(
    callRequest: CallRequestDocument,
  ): Promise<void> {
    const event: CallApprovedEvent = {
      callRequestId: callRequest.id,
      email: callRequest.email,
      phoneNumber: callRequest.phoneNumber,
      scheduledAt: callRequest.scheduledAt.toISOString(),
    };
    const publicBooking = toPublicBookingEventContext(callRequest);

    if (publicBooking) {
      event.publicBooking = publicBooking;
    }

    await this.rabbitmqPublisherService.publish(
      RabbitmqRoutingKey.CALL_APPROVED,
      event,
    );
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
    meetingLocation: eventType?.meetingLocation,
    minimumNoticeMinutes: eventType?.minimumNoticeMinutes,
    maxFutureDays: eventType?.maxFutureDays,
  };
}

function getPublicBookingRouteContext(
  eventType: EventTypeDocument,
  hostSlug = eventType.hostId.toString(),
): PublicBookingRouteContext {
  return {
    hostId: eventType.hostId.toString(),
    hostSlug,
    eventTypeSlug: eventType.slug,
  };
}

function toPublicBookingEventContext(
  callRequest: CallRequestDocument,
): CallRequestedEvent['publicBooking'] {
  if (
    !callRequest.publicBookingHostId ||
    !callRequest.publicBookingHostSlug ||
    !callRequest.publicBookingEventTypeSlug
  ) {
    return undefined;
  }

  return {
    hostSlug: callRequest.publicBookingHostSlug,
    eventTypeSlug: callRequest.publicBookingEventTypeSlug,
    cancellationToken: callRequest.cancellationToken,
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
