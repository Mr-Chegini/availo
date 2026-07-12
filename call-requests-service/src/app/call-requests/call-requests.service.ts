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
  CallRescheduledEvent,
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
import { MetricsService } from '../metrics/metrics.service';
import { BookingLockService } from './booking-lock.service';

interface AvailabilityRules {
  hostId?: string;
  eventTypeId?: string;
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
  eventTypeId: string;
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
    private readonly metricsService: MetricsService,
    private readonly bookingLockService: BookingLockService,
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

    const callRequest = await this.bookingLockService.runExclusive(
      getBookingLockScope(input.publicBookingRoute?.hostId),
      async () => {
        await this.assertTimeRangeAvailable({
          scheduledAt,
          durationMinutes: availabilityRules.durationMinutes,
          hostId: input.publicBookingRoute?.hostId,
        });

        return this.createCallRequest({
          email,
          phoneNumber,
          scheduledAt,
          durationMinutes: availabilityRules.durationMinutes,
          meetingLocation: input.meetingLocation,
          publicBookingRoute: input.publicBookingRoute,
        });
      },
    );

    const event: CallRequestedEvent = {
      callRequestId: callRequest.id,
      email: callRequest.email,
      phoneNumber: callRequest.phoneNumber,
      scheduledAt: callRequest.scheduledAt.toISOString(),
    };
    Object.assign(event, getBookingOwnershipEventContext(callRequest));
    const publicBooking = toPublicBookingEventContext(callRequest);

    if (publicBooking) {
      event.publicBooking = publicBooking;
    }

    await this.rabbitmqPublisherService.publish(
      RabbitmqRoutingKey.CALL_REQUESTED,
      event,
    );

    this.metricsService.increment('booking.requested');

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
    return this.bookingLockService.runExclusive(
      getBookingLockScope(input.publicBookingRoute?.hostId),
      async () => {
        await this.assertTimeRangeAvailable({
          scheduledAt,
          durationMinutes: availabilityRules.durationMinutes,
          hostId: input.publicBookingRoute?.hostId,
        });

        const calendarEvent = await this.calendarProvider.createEvent(
          this.toCalendarEventInput(
            {
              ...input,
              calendarOwnerId: input.publicBookingRoute?.hostId,
            },
            availabilityRules.durationMinutes,
          ),
        );

        try {
          const callRequest = await this.createCallRequest({
            email,
            phoneNumber,
            scheduledAt,
            durationMinutes: availabilityRules.durationMinutes,
            meetingLocation: input.meetingLocation,
            publicBookingRoute: input.publicBookingRoute,
            status: CallRequestStatus.SCHEDULED,
            calendarProviderEventId: calendarEvent.providerEventId,
          });

          await this.publishCallApproved(callRequest);
          this.metricsService.increment('booking.scheduled');
          this.logger.log(
            createStructuredLog('call_request.scheduled', {
              callRequestId: callRequest.id,
              scheduledAt: callRequest.scheduledAt.toISOString(),
              autoConfirmed: true,
              hasPublicBooking: Boolean(
                toPublicBookingEventContext(callRequest),
              ),
              hasCalendarEvent: Boolean(callRequest.calendarProviderEventId),
            }),
          );

          return callRequest;
        } catch (error) {
          if (calendarEvent.providerEventId) {
            await this.calendarProvider.cancelEvent({
              providerEventId: calendarEvent.providerEventId,
              ownerId: input.publicBookingRoute?.hostId,
            });
          }

          throw error;
        }
      },
    );
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

  private async assertTimeRangeAvailable(input: {
    scheduledAt: Date;
    durationMinutes: number;
    hostId?: string;
    excludeCallRequestId?: string;
  }): Promise<void> {
    const startsAt = DateTime.fromJSDate(input.scheduledAt).toUTC();
    const endsAt = startsAt.plus({ minutes: input.durationMinutes });
    const query = buildActiveReservationLookupQuery({
      startsAt: startsAt.toJSDate(),
      endsAt: endsAt.toJSDate(),
      hostId: input.hostId,
      excludeCallRequestId: input.excludeCallRequestId,
    });

    const existingCallRequests = await this.callRequestModel
      .find(query)
      .select('scheduledAt durationMinutes')
      .lean();

    const hasConflict = existingCallRequests.some((callRequest) => {
      const existingStartsAt = DateTime.fromJSDate(
        callRequest.scheduledAt,
      ).toUTC();
      const existingEndsAt = existingStartsAt.plus({
        minutes: callRequest.durationMinutes ?? input.durationMinutes,
      });

      return rangesOverlap(startsAt, endsAt, existingStartsAt, existingEndsAt);
    });

    if (hasConflict) {
      throw new ConflictException('This time slot is already reserved');
    }
  }

  private async createCallRequest(dto: {
    email: string;
    phoneNumber: string;
    scheduledAt: Date;
    durationMinutes?: number;
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
        durationMinutes?: number;
        status: CallRequestStatus;
        cancellationToken: string;
        calendarProviderEventId?: string;
        meetingLocation?: string;
        hostId?: string;
        eventTypeId?: string;
        publicBookingHostId?: string;
        publicBookingHostSlug?: string;
        publicBookingEventTypeSlug?: string;
      } = {
        email: dto.email,
        phoneNumber: dto.phoneNumber,
        scheduledAt: dto.scheduledAt,
        durationMinutes: dto.durationMinutes,
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
        createInput.hostId = dto.publicBookingRoute.hostId;
        createInput.eventTypeId = dto.publicBookingRoute.eventTypeId;
        createInput.publicBookingHostId = dto.publicBookingRoute.hostId;
        createInput.publicBookingHostSlug = dto.publicBookingRoute.hostSlug;
        createInput.publicBookingEventTypeSlug =
          dto.publicBookingRoute.eventTypeSlug;
      }

      return await this.callRequestModel.create(createInput);
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new ConflictException('This time slot is already reserved');
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
      .find(
        buildActiveReservationLookupQuery({
          startsAt: startOfWorkingDay.toUTC().toJSDate(),
          endsAt: endOfWorkingDay.toUTC().toJSDate(),
          hostId: availabilityRules.hostId,
        }),
      )
      .select('scheduledAt durationMinutes')
      .lean();

    const busySlotsInput = {
      from: startOfWorkingDay.toUTC().toISO() ?? '',
      to: endOfWorkingDay.toUTC().toISO() ?? '',
      ownerId: availabilityRules.hostId,
    };

    if (!busySlotsInput.ownerId) {
      delete busySlotsInput.ownerId;
    }

    const externalBusySlots =
      await this.calendarProvider.getBusySlots(busySlotsInput);

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
          fallbackReservationDurationMinutes: availabilityRules.durationMinutes,
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

    const availabilityRules =
      await this.getAvailabilityRulesForExistingBooking(callRequest);

    const calendarEvent = await this.calendarProvider.createEvent(
      this.toCalendarEventInput(
        {
          email: callRequest.email,
          phoneNumber: callRequest.phoneNumber,
          scheduledAt: callRequest.scheduledAt,
          meetingLocation:
            callRequest.meetingLocation ?? availabilityRules.meetingLocation,
          calendarOwnerId: getCalendarOwnerId(callRequest),
        },
        availabilityRules.durationMinutes,
      ),
    );

    callRequest.status = CallRequestStatus.SCHEDULED;
    callRequest.calendarProviderEventId = calendarEvent.providerEventId;
    await callRequest.save();

    await this.publishCallApproved(callRequest);

    this.metricsService.increment('booking.approved');

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
    Object.assign(event, getBookingOwnershipEventContext(callRequest));

    await this.rabbitmqPublisherService.publish(
      RabbitmqRoutingKey.CALL_REJECTED,
      event,
    );

    this.metricsService.increment('booking.rejected');

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

    return this.cancelPublicCallRequest(callRequest);
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
    const wasScheduled = callRequest.status === CallRequestStatus.SCHEDULED;

    if (!wasScheduled && callRequest.status !== CallRequestStatus.REQUESTED) {
      throw new ConflictException(
        'Only requested or scheduled calls can be rescheduled',
      );
    }

    this.validateScheduledAt(scheduledAt, availabilityRules);
    await this.bookingLockService.runExclusive(
      getBookingLockScope(eventType.hostId.toString()),
      async () => {
        await this.assertTimeRangeAvailable({
          scheduledAt,
          durationMinutes: availabilityRules.durationMinutes,
          hostId: eventType.hostId.toString(),
          excludeCallRequestId: callRequest.id,
        });

        if (wasScheduled) {
          await this.updateScheduledCallRequestCalendarEvent(
            callRequest,
            scheduledAt,
            availabilityRules.durationMinutes,
          );
        }

        callRequest.scheduledAt = scheduledAt;
        callRequest.durationMinutes = availabilityRules.durationMinutes;

        try {
          await callRequest.save();
        } catch (error) {
          if (isDuplicateKeyError(error)) {
            throw new ConflictException('This time slot is already reserved');
          }

          throw error;
        }
      },
    );

    this.metricsService.increment('booking.rescheduled');

    if (wasScheduled) {
      await this.publishCallRescheduled(callRequest);
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
          calendarOwnerId: getCalendarOwnerId(callRequest),
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
      $or?: Array<Record<string, unknown>>;
      publicBookingHostId?: string;
      publicBookingEventTypeSlug?: string;
    } = {
      _id: id,
      cancellationToken,
    };

    if (eventType) {
      query.$or = [
        {
          hostId: eventType.hostId,
          eventTypeId: eventType._id,
        },
        {
          publicBookingHostId: eventType.hostId.toString(),
          publicBookingEventTypeSlug: eventType.slug,
        },
      ];
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

    return this.cancelActiveCallRequest(callRequest);
  }

  private async cancelPublicCallRequest(
    callRequest: CallRequestDocument,
  ): Promise<CallRequestResponseDto> {
    if (
      callRequest.status !== CallRequestStatus.REQUESTED &&
      callRequest.status !== CallRequestStatus.SCHEDULED
    ) {
      throw new ConflictException(
        'Only requested or scheduled calls can be canceled',
      );
    }

    return this.cancelActiveCallRequest(callRequest);
  }

  private async cancelActiveCallRequest(
    callRequest: CallRequestDocument,
  ): Promise<CallRequestResponseDto> {
    const hadCalendarEvent = Boolean(callRequest.calendarProviderEventId);

    if (callRequest.calendarProviderEventId) {
      await this.calendarProvider.cancelEvent({
        providerEventId: callRequest.calendarProviderEventId,
        ownerId: getCalendarOwnerId(callRequest),
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
    Object.assign(event, getBookingOwnershipEventContext(callRequest));

    await this.rabbitmqPublisherService.publish(
      RabbitmqRoutingKey.CALL_CANCELED,
      event,
    );

    this.metricsService.increment('booking.canceled');

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
      calendarOwnerId?: string;
    },
    durationMinutes: number,
  ): CreateCalendarEventInput {
    const calendarEventInput: CreateCalendarEventInput = {
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

    if (input.calendarOwnerId) {
      calendarEventInput.ownerId = input.calendarOwnerId;
    }

    return calendarEventInput;
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
    Object.assign(event, getBookingOwnershipEventContext(callRequest));
    const publicBooking = toPublicBookingEventContext(callRequest);

    if (publicBooking) {
      event.publicBooking = publicBooking;
    }

    await this.rabbitmqPublisherService.publish(
      RabbitmqRoutingKey.CALL_APPROVED,
      event,
    );
  }

  private async publishCallRescheduled(
    callRequest: CallRequestDocument,
  ): Promise<void> {
    const event: CallRescheduledEvent = {
      callRequestId: callRequest.id,
      email: callRequest.email,
      phoneNumber: callRequest.phoneNumber,
      scheduledAt: callRequest.scheduledAt.toISOString(),
    };
    Object.assign(event, getBookingOwnershipEventContext(callRequest));

    await this.rabbitmqPublisherService.publish(
      RabbitmqRoutingKey.CALL_RESCHEDULED,
      event,
    );
  }

  private async getDefaultAvailabilityRules(): Promise<AvailabilityRules> {
    const eventType = await this.eventTypesService.findDefaultActiveEventType();

    return getAvailabilityRules(eventType);
  }

  private async getAvailabilityRulesForExistingBooking(
    callRequest: CallRequestDocument,
  ): Promise<AvailabilityRules> {
    if (callRequest.eventTypeId) {
      const eventType = await this.eventTypesService.getById(
        callRequest.eventTypeId,
      );

      return getAvailabilityRules(eventType);
    }

    // Legacy bookings created before booking ownership existed do not have
    // eventTypeId. Keep them approvable by using the default event type.
    return this.getDefaultAvailabilityRules();
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
    localReservations: Array<{ scheduledAt: Date; durationMinutes?: number }>;
    externalBusySlots: Array<{ startsAt: string; endsAt: string }>;
    fallbackReservationDurationMinutes: number;
  }): boolean {
    const localConflict = input.localReservations.some((callRequest) => {
      const startsAt = DateTime.fromJSDate(callRequest.scheduledAt);
      const endsAt = startsAt.plus({
        minutes:
          callRequest.durationMinutes ??
          input.fallbackReservationDurationMinutes,
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
    hostId: eventType?.hostId?.toString(),
    eventTypeId: eventType?.id,
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

function buildActiveReservationLookupQuery(input: {
  startsAt: Date;
  endsAt: Date;
  hostId?: string;
  excludeCallRequestId?: string;
}) {
  const query: {
    scheduledAt: {
      $lt: Date;
    };
    status: {
      $in: CallRequestStatus[];
    };
    _id?: {
      $ne: string;
    };
    $or?: Array<Record<string, unknown>>;
  } = {
    scheduledAt: {
      $lt: input.endsAt,
    },
    status: {
      $in: ACTIVE_RESERVATION_STATUSES,
    },
  };

  if (input.hostId) {
    query.$or = [
      { hostId: input.hostId },
      { publicBookingHostId: input.hostId },
      {
        hostId: { $exists: false },
        publicBookingHostId: { $exists: false },
      },
    ];
  }

  if (input.excludeCallRequestId) {
    query._id = {
      $ne: input.excludeCallRequestId,
    };
  }

  return query;
}

function getPublicBookingRouteContext(
  eventType: EventTypeDocument,
  hostSlug = eventType.hostId.toString(),
): PublicBookingRouteContext {
  return {
    hostId: eventType.hostId.toString(),
    eventTypeId: eventType.id,
    hostSlug,
    eventTypeSlug: eventType.slug,
  };
}

function getCalendarOwnerId(
  callRequest: CallRequestDocument,
): string | undefined {
  return callRequest.hostId?.toString() ?? callRequest.publicBookingHostId;
}

function getBookingLockScope(hostId?: string): string {
  return hostId ? `host:${hostId}` : 'legacy-global';
}

function getBookingOwnershipEventContext(
  callRequest: CallRequestDocument,
): Pick<
  CallRequestedEvent,
  'hostId' | 'eventTypeId' | 'hostSlug' | 'eventTypeSlug'
> {
  const context: Pick<
    CallRequestedEvent,
    'hostId' | 'eventTypeId' | 'hostSlug' | 'eventTypeSlug'
  > = {};

  if (callRequest.hostId) {
    context.hostId = callRequest.hostId.toString();
  } else if (callRequest.publicBookingHostId) {
    context.hostId = callRequest.publicBookingHostId;
  }

  if (callRequest.eventTypeId) {
    context.eventTypeId = callRequest.eventTypeId.toString();
  }

  if (callRequest.publicBookingHostSlug) {
    context.hostSlug = callRequest.publicBookingHostSlug;
  }

  if (callRequest.publicBookingEventTypeSlug) {
    context.eventTypeSlug = callRequest.publicBookingEventTypeSlug;
  }

  return context;
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
    hostId: callRequest.hostId?.toString() ?? callRequest.publicBookingHostId,
    eventTypeId: callRequest.eventTypeId?.toString(),
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
