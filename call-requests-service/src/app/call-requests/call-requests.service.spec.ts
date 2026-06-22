import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import type { Model } from 'mongoose';
import { CallRequestStatus, RabbitmqRoutingKey } from '@org/shared-types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RabbitmqPublisherService } from '../messaging/rabbitmq-publisher.service';
import { CallRequestsService } from './call-requests.service';
import type { CallRequestDocument } from './call-request.schema';
import type { CalendarProvider } from '../calendar/calendar-provider';
import type { EventTypesService } from '../hosts/event-types.service';
import type { MetricsService } from '../metrics/metrics.service';

const SCHEDULED_AT = new Date('2026-05-15T07:00:00.000Z');
const CREATED_AT = new Date('2026-05-10T07:00:00.000Z');
const UPDATED_AT = new Date('2026-05-10T07:30:00.000Z');

type TestCallRequestDocument = Pick<
  CallRequestDocument,
  | 'id'
  | 'email'
  | 'phoneNumber'
  | 'scheduledAt'
  | 'status'
  | 'adminNote'
  | 'cancellationToken'
  | 'calendarProviderEventId'
  | 'meetingLocation'
  | 'publicBookingHostId'
  | 'publicBookingEventTypeSlug'
  | 'createdAt'
  | 'updatedAt'
  | 'save'
>;

describe('CallRequestsService', () => {
  let callRequestModel: {
    create: ReturnType<typeof vi.fn>;
    exists: ReturnType<typeof vi.fn>;
    findById: ReturnType<typeof vi.fn>;
    findOne: ReturnType<typeof vi.fn>;
    find: ReturnType<typeof vi.fn>;
  };
  let rabbitmqPublisherService: {
    publish: ReturnType<typeof vi.fn>;
  };
  let calendarProvider: {
    getBusySlots: ReturnType<typeof vi.fn>;
    createEvent: ReturnType<typeof vi.fn>;
    updateEvent: ReturnType<typeof vi.fn>;
    cancelEvent: ReturnType<typeof vi.fn>;
  };
  let eventTypesService: {
    findDefaultActiveEventType: ReturnType<typeof vi.fn>;
  };
  let metricsService: {
    increment: ReturnType<typeof vi.fn>;
  };
  let service: CallRequestsService;

  beforeEach(() => {
    callRequestModel = {
      create: vi.fn(),
      exists: vi.fn(),
      findById: vi.fn(),
      findOne: vi.fn(),
      find: vi.fn(),
    };
    rabbitmqPublisherService = {
      publish: vi.fn().mockResolvedValue(undefined),
    };
    calendarProvider = {
      getBusySlots: vi.fn().mockResolvedValue([]),
      createEvent: vi.fn().mockResolvedValue({}),
      updateEvent: vi.fn().mockResolvedValue(undefined),
      cancelEvent: vi.fn().mockResolvedValue(undefined),
    };
    eventTypesService = {
      findDefaultActiveEventType: vi.fn().mockResolvedValue(null),
    };
    metricsService = {
      increment: vi.fn(),
    };

    service = new CallRequestsService(
      callRequestModel as unknown as Model<CallRequestDocument>,
      rabbitmqPublisherService as unknown as RabbitmqPublisherService,
      calendarProvider as unknown as CalendarProvider,
      eventTypesService as unknown as EventTypesService,
      metricsService as unknown as MetricsService,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('uses default event type minimum notice when creating call requests', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2030-01-01T08:00:00.000Z'));
    eventTypesService.findDefaultActiveEventType.mockResolvedValue(
      mockEventTypeRules({
        minimumNoticeMinutes: 120,
      }),
    );

    await expect(
      service.create({
        email: 'user@example.com',
        phoneNumber: '+90 555 111 22 33',
        scheduledAt: '2030-01-01T09:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.create({
        email: 'user@example.com',
        phoneNumber: '+90 555 111 22 33',
        scheduledAt: '2030-01-01T09:00:00.000Z',
      }),
    ).rejects.toThrow('Bookings require at least 120 minutes notice');
    expect(callRequestModel.exists).not.toHaveBeenCalled();
  });

  it('uses default event type max future days when creating call requests', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2030-01-01T08:00:00.000Z'));
    eventTypesService.findDefaultActiveEventType.mockResolvedValue(
      mockEventTypeRules({
        maxFutureDays: 30,
      }),
    );

    await expect(
      service.create({
        email: 'user@example.com',
        phoneNumber: '+90 555 111 22 33',
        scheduledAt: '2030-02-15T09:00:00.000Z',
      }),
    ).rejects.toThrow('Bookings cannot be more than 30 days in advance');
    expect(callRequestModel.exists).not.toHaveBeenCalled();
  });

  it('creates call requests with selected event type rules', async () => {
    const scheduledAt = new Date('2030-01-01T09:00:00.000Z');
    const callRequest = mockCallRequest(CallRequestStatus.REQUESTED, {
      scheduledAt,
      meetingLocation: 'Google Meet',
      publicBookingHostId: 'host-1',
      publicBookingHostSlug: 'host-1',
      publicBookingEventTypeSlug: 'intro-call',
    });
    callRequestModel.exists.mockResolvedValue(null);
    callRequestModel.create.mockResolvedValue(callRequest);

    const response = await service.createForEventType(
      {
        email: ' USER@Example.COM ',
        phoneNumber: ' +90 555 111 22 33 ',
        scheduledAt: '2030-01-01T09:00:00.000Z',
      },
      mockEventTypeRules({
        availabilityTimezone: 'UTC',
        workdayStartHour: 9,
        workdayEndHour: 17,
        slotIntervalMinutes: 30,
        meetingLocation: 'Google Meet',
      }) as never,
    );

    expect(eventTypesService.findDefaultActiveEventType).not.toHaveBeenCalled();
    expect(callRequestModel.exists).toHaveBeenCalledWith({
      scheduledAt,
      status: {
        $in: [CallRequestStatus.REQUESTED, CallRequestStatus.SCHEDULED],
      },
    });
    expect(callRequestModel.create).toHaveBeenCalledWith({
      email: 'user@example.com',
      phoneNumber: '+90 555 111 22 33',
      scheduledAt,
      status: CallRequestStatus.REQUESTED,
      cancellationToken: expect.any(String),
      meetingLocation: 'Google Meet',
      publicBookingHostId: 'host-1',
      publicBookingHostSlug: 'host-1',
      publicBookingEventTypeSlug: 'intro-call',
    });
    expect(
      callRequestModel.create.mock.calls[0][0].cancellationToken,
    ).toHaveLength(64);
    expect(rabbitmqPublisherService.publish).toHaveBeenCalledWith(
      RabbitmqRoutingKey.CALL_REQUESTED,
      expect.objectContaining({
        callRequestId: 'call-1',
        email: 'user@example.com',
        scheduledAt: '2030-01-01T09:00:00.000Z',
        publicBooking: {
          hostSlug: 'host-1',
          eventTypeSlug: 'intro-call',
          cancellationToken: 'cancel-token',
        },
      }),
    );
    expect(metricsService.increment).toHaveBeenCalledWith('booking.requested');
    expect(response.status).toBe(CallRequestStatus.REQUESTED);
    expect(response.cancellationToken).toBe('cancel-token');
    expect(response.meetingLocation).toBe('Google Meet');
  });

  it('auto-confirms public bookings for event types that do not require approval', async () => {
    const scheduledAt = new Date('2030-01-01T09:00:00.000Z');
    const callRequest = mockCallRequest(CallRequestStatus.SCHEDULED, {
      scheduledAt,
      calendarProviderEventId: 'google-event-1',
      publicBookingHostId: 'host-1',
      publicBookingHostSlug: 'host-1',
      publicBookingEventTypeSlug: 'intro-call',
    });
    callRequestModel.exists.mockResolvedValue(null);
    callRequestModel.create.mockResolvedValue(callRequest);
    calendarProvider.createEvent.mockResolvedValueOnce({
      providerEventId: 'google-event-1',
    });

    const response = await service.createForEventType(
      {
        email: 'user@example.com',
        phoneNumber: '+90 555 111 22 33',
        scheduledAt: '2030-01-01T09:00:00.000Z',
      },
      mockEventTypeRules({
        requiresApproval: false,
        availabilityTimezone: 'UTC',
        workdayStartHour: 9,
        workdayEndHour: 17,
        slotIntervalMinutes: 30,
        meetingLocation: 'Zoom',
      }) as never,
    );

    expect(callRequestModel.create).toHaveBeenCalledWith({
      email: 'user@example.com',
      phoneNumber: '+90 555 111 22 33',
      scheduledAt,
      status: CallRequestStatus.SCHEDULED,
      cancellationToken: expect.any(String),
      calendarProviderEventId: 'google-event-1',
      meetingLocation: 'Zoom',
      publicBookingHostId: 'host-1',
      publicBookingHostSlug: 'host-1',
      publicBookingEventTypeSlug: 'intro-call',
    });
    expect(calendarProvider.createEvent).toHaveBeenCalledWith({
      title: 'Call with user@example.com',
      startsAt: '2030-01-01T09:00:00.000Z',
      endsAt: '2030-01-01T09:30:00.000Z',
      attendeeEmail: 'user@example.com',
      attendeePhoneNumber: '+90 555 111 22 33',
      location: 'Zoom',
    });
    expect(rabbitmqPublisherService.publish).toHaveBeenCalledOnce();
    expect(rabbitmqPublisherService.publish).toHaveBeenCalledWith(
      RabbitmqRoutingKey.CALL_APPROVED,
      {
        callRequestId: 'call-1',
        email: 'user@example.com',
        phoneNumber: '+90 555 111 22 33',
        scheduledAt: '2030-01-01T09:00:00.000Z',
        publicBooking: {
          hostSlug: 'host-1',
          eventTypeSlug: 'intro-call',
          cancellationToken: 'cancel-token',
        },
      },
    );
    expect(metricsService.increment).toHaveBeenCalledWith('booking.scheduled');
    expect(response.status).toBe(CallRequestStatus.SCHEDULED);
    expect(response.cancellationToken).toBe('cancel-token');
  });

  it('marks local reservations and external calendar busy slots as unavailable', async () => {
    mockAvailabilityCallRequests([
      {
        scheduledAt: new Date('2030-01-01T07:00:00.000Z'),
      },
    ]);
    calendarProvider.getBusySlots.mockResolvedValue([
      {
        startsAt: '2030-01-01T07:30:00.000Z',
        endsAt: '2030-01-01T08:00:00.000Z',
        source: 'google',
      },
    ]);

    const availability = await service.getAvailability('2030-01-01');

    expect(calendarProvider.getBusySlots).toHaveBeenCalledWith({
      from: '2030-01-01T07:00:00.000Z',
      to: '2030-01-01T15:00:00.000Z',
    });
    expect(availability.slice(0, 3)).toEqual([
      {
        scheduledAt: '2030-01-01T07:00:00.000Z',
        available: false,
      },
      {
        scheduledAt: '2030-01-01T07:30:00.000Z',
        available: false,
      },
      {
        scheduledAt: '2030-01-01T08:00:00.000Z',
        available: true,
      },
    ]);
  });

  it('uses the default event type duration when checking availability conflicts', async () => {
    eventTypesService.findDefaultActiveEventType.mockResolvedValue({
      durationMinutes: 60,
    });
    mockAvailabilityCallRequests([]);
    calendarProvider.getBusySlots.mockResolvedValue([
      {
        startsAt: '2030-01-01T07:30:00.000Z',
        endsAt: '2030-01-01T08:00:00.000Z',
        source: 'google',
      },
    ]);

    const availability = await service.getAvailability('2030-01-01');

    expect(availability.slice(0, 3)).toEqual([
      {
        scheduledAt: '2030-01-01T07:00:00.000Z',
        available: false,
      },
      {
        scheduledAt: '2030-01-01T07:30:00.000Z',
        available: false,
      },
      {
        scheduledAt: '2030-01-01T08:00:00.000Z',
        available: true,
      },
    ]);
  });

  it('uses default event type availability rules when building slots', async () => {
    eventTypesService.findDefaultActiveEventType.mockResolvedValue({
      durationMinutes: 30,
      availabilityTimezone: 'UTC',
      workdayStartHour: 9,
      workdayEndHour: 11,
      slotIntervalMinutes: 60,
    });
    mockAvailabilityCallRequests([]);

    const availability = await service.getAvailability('2030-01-01');

    expect(callRequestModel.find).toHaveBeenCalledWith({
      scheduledAt: {
        $gte: new Date('2030-01-01T09:00:00.000Z'),
        $lt: new Date('2030-01-01T11:00:00.000Z'),
      },
      status: {
        $in: [CallRequestStatus.REQUESTED, CallRequestStatus.SCHEDULED],
      },
    });
    expect(calendarProvider.getBusySlots).toHaveBeenCalledWith({
      from: '2030-01-01T09:00:00.000Z',
      to: '2030-01-01T11:00:00.000Z',
    });
    expect(availability).toEqual([
      {
        scheduledAt: '2030-01-01T09:00:00.000Z',
        available: true,
      },
      {
        scheduledAt: '2030-01-01T10:00:00.000Z',
        available: true,
      },
    ]);
  });

  it('uses an explicit event type when building public booking availability', async () => {
    mockAvailabilityCallRequests([]);

    const availability = await service.getAvailabilityForEventType(
      '2030-01-01',
      mockEventTypeRules({
        durationMinutes: 45,
        availabilityTimezone: 'UTC',
        workdayStartHour: 9,
        workdayEndHour: 11,
        slotIntervalMinutes: 30,
      }) as never,
    );

    expect(eventTypesService.findDefaultActiveEventType).not.toHaveBeenCalled();
    expect(calendarProvider.getBusySlots).toHaveBeenCalledWith({
      from: '2030-01-01T09:00:00.000Z',
      to: '2030-01-01T11:00:00.000Z',
    });
    expect(availability).toHaveLength(4);
  });

  it('approves requested calls and publishes an approval event', async () => {
    const callRequest = mockCallRequest(CallRequestStatus.REQUESTED);
    mockFindById(callRequest);
    calendarProvider.createEvent.mockResolvedValueOnce({
      providerEventId: 'google-event-1',
    });

    const response = await service.approve('call-1');

    expect(callRequest.status).toBe(CallRequestStatus.SCHEDULED);
    expect(callRequest.calendarProviderEventId).toBe('google-event-1');
    expect(callRequest.save).toHaveBeenCalledOnce();
    expect(calendarProvider.createEvent).toHaveBeenCalledWith({
      title: 'Call with user@example.com',
      startsAt: '2026-05-15T07:00:00.000Z',
      endsAt: '2026-05-15T07:30:00.000Z',
      attendeeEmail: 'user@example.com',
      attendeePhoneNumber: '+90 555 111 22 33',
      location: undefined,
    });
    expect(rabbitmqPublisherService.publish).toHaveBeenCalledWith(
      RabbitmqRoutingKey.CALL_APPROVED,
      {
        callRequestId: 'call-1',
        email: 'user@example.com',
        phoneNumber: '+90 555 111 22 33',
        scheduledAt: '2026-05-15T07:00:00.000Z',
      },
    );
    expect(metricsService.increment).toHaveBeenCalledWith('booking.approved');
    expect(response.status).toBe(CallRequestStatus.SCHEDULED);
  });

  it('uses the default event type duration when creating approved calendar events', async () => {
    eventTypesService.findDefaultActiveEventType.mockResolvedValue({
      durationMinutes: 45,
    });
    const callRequest = mockCallRequest(CallRequestStatus.REQUESTED);
    mockFindById(callRequest);

    await service.approve('call-1');

    expect(calendarProvider.createEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        startsAt: '2026-05-15T07:00:00.000Z',
        endsAt: '2026-05-15T07:45:00.000Z',
      }),
    );
  });

  it('rejects requested calls and publishes a rejection event', async () => {
    const callRequest = mockCallRequest(CallRequestStatus.REQUESTED);
    mockFindById(callRequest);

    const response = await service.reject('call-1');

    expect(callRequest.status).toBe(CallRequestStatus.REJECTED);
    expect(callRequest.save).toHaveBeenCalledOnce();
    expect(rabbitmqPublisherService.publish).toHaveBeenCalledWith(
      RabbitmqRoutingKey.CALL_REJECTED,
      {
        callRequestId: 'call-1',
        email: 'user@example.com',
      },
    );
    expect(metricsService.increment).toHaveBeenCalledWith('booking.rejected');
    expect(response.status).toBe(CallRequestStatus.REJECTED);
  });

  it('marks scheduled calls as called without publishing an event', async () => {
    const callRequest = mockCallRequest(CallRequestStatus.SCHEDULED);
    mockFindById(callRequest);

    const response = await service.markAsCalled('call-1');

    expect(callRequest.status).toBe(CallRequestStatus.CALLED);
    expect(callRequest.save).toHaveBeenCalledOnce();
    expect(rabbitmqPublisherService.publish).not.toHaveBeenCalled();
    expect(metricsService.increment).not.toHaveBeenCalled();
    expect(response.status).toBe(CallRequestStatus.CALLED);
  });

  it('cancels scheduled calls and publishes a cancellation event', async () => {
    const callRequest = mockCallRequest(CallRequestStatus.SCHEDULED, {
      calendarProviderEventId: 'google-event-1',
    });
    mockFindById(callRequest);

    const response = await service.cancel('call-1');

    expect(calendarProvider.cancelEvent).toHaveBeenCalledWith({
      providerEventId: 'google-event-1',
    });
    expect(callRequest.status).toBe(CallRequestStatus.CANCELED);
    expect(callRequest.calendarProviderEventId).toBeUndefined();
    expect(callRequest.save).toHaveBeenCalledOnce();
    expect(rabbitmqPublisherService.publish).toHaveBeenCalledWith(
      RabbitmqRoutingKey.CALL_CANCELED,
      {
        callRequestId: 'call-1',
        email: 'user@example.com',
        scheduledAt: '2026-05-15T07:00:00.000Z',
      },
    );
    expect(metricsService.increment).toHaveBeenCalledWith('booking.canceled');
    expect(response.status).toBe(CallRequestStatus.CANCELED);
  });

  it('cancels scheduled calls with a matching cancellation token', async () => {
    const callRequest = mockCallRequest(CallRequestStatus.SCHEDULED, {
      calendarProviderEventId: 'google-event-1',
    });
    mockFindOne(callRequest);

    const response = await service.cancelWithToken('call-1', 'cancel-token');

    expect(callRequestModel.findOne).toHaveBeenCalledWith({
      _id: 'call-1',
      cancellationToken: 'cancel-token',
    });
    expect(calendarProvider.cancelEvent).toHaveBeenCalledWith({
      providerEventId: 'google-event-1',
    });
    expect(callRequest.status).toBe(CallRequestStatus.CANCELED);
    expect(callRequest.calendarProviderEventId).toBeUndefined();
    expect(callRequest.save).toHaveBeenCalledOnce();
    expect(rabbitmqPublisherService.publish).toHaveBeenCalledWith(
      RabbitmqRoutingKey.CALL_CANCELED,
      {
        callRequestId: 'call-1',
        email: 'user@example.com',
        scheduledAt: '2026-05-15T07:00:00.000Z',
      },
    );
    expect(response.status).toBe(CallRequestStatus.CANCELED);
  });

  it('throws when a cancellation token does not match a call request', async () => {
    mockFindOne(null);

    await expect(
      service.cancelWithToken('call-1', 'wrong-token'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns public booking details with a matching route-scoped token', async () => {
    const callRequest = mockCallRequest(CallRequestStatus.SCHEDULED, {
      publicBookingHostId: 'host-1',
      publicBookingEventTypeSlug: 'intro-call',
      meetingLocation: 'Google Meet',
    });
    mockFindOne(callRequest);

    const response = await service.getPublicBookingWithToken(
      'call-1',
      'cancel-token',
      mockEventTypeRules({
        meetingLocation: 'Google Meet',
      }) as never,
    );

    expect(callRequestModel.findOne).toHaveBeenCalledWith({
      _id: 'call-1',
      cancellationToken: 'cancel-token',
      publicBookingHostId: 'host-1',
      publicBookingEventTypeSlug: 'intro-call',
    });
    expect(response).toEqual(
      expect.objectContaining({
        id: 'call-1',
        email: 'user@example.com',
        phoneNumber: '+90 555 111 22 33',
        status: CallRequestStatus.SCHEDULED,
        cancellationToken: 'cancel-token',
        meetingLocation: 'Google Meet',
      }),
    );
    expect(response).not.toHaveProperty('calendarProviderEventId');
  });

  it('reschedules requested calls with a matching cancellation token', async () => {
    const scheduledAt = new Date('2030-01-01T09:00:00.000Z');
    const callRequest = mockCallRequest(CallRequestStatus.REQUESTED);
    mockFindOne(callRequest);
    callRequestModel.exists.mockResolvedValue(null);

    const response = await service.rescheduleWithToken(
      'call-1',
      'cancel-token',
      {
        scheduledAt: '2030-01-01T09:00:00.000Z',
      },
      mockEventTypeRules({
        availabilityTimezone: 'UTC',
        workdayStartHour: 9,
        workdayEndHour: 17,
        slotIntervalMinutes: 30,
      }) as never,
    );

    expect(callRequestModel.findOne).toHaveBeenCalledWith({
      _id: 'call-1',
      cancellationToken: 'cancel-token',
      publicBookingHostId: 'host-1',
      publicBookingEventTypeSlug: 'intro-call',
    });
    expect(callRequestModel.exists).toHaveBeenCalledWith({
      scheduledAt,
      status: {
        $in: [CallRequestStatus.REQUESTED, CallRequestStatus.SCHEDULED],
      },
      _id: {
        $ne: 'call-1',
      },
    });
    expect(callRequest.scheduledAt).toEqual(scheduledAt);
    expect(calendarProvider.updateEvent).not.toHaveBeenCalled();
    expect(callRequest.save).toHaveBeenCalledOnce();
    expect(rabbitmqPublisherService.publish).not.toHaveBeenCalled();
    expect(metricsService.increment).toHaveBeenCalledWith(
      'booking.rescheduled',
    );
    expect(response.scheduledAt).toBe('2030-01-01T09:00:00.000Z');
    expect(response.cancellationToken).toBe('cancel-token');
  });

  it('reschedules scheduled calls and updates the calendar event', async () => {
    const scheduledAt = new Date('2030-01-01T09:00:00.000Z');
    const callRequest = mockCallRequest(CallRequestStatus.SCHEDULED, {
      calendarProviderEventId: 'google-event-1',
      meetingLocation: 'Zoom',
    });
    mockFindOne(callRequest);
    callRequestModel.exists.mockResolvedValue(null);

    const response = await service.rescheduleWithToken(
      'call-1',
      'cancel-token',
      {
        scheduledAt: '2030-01-01T09:00:00.000Z',
      },
      mockEventTypeRules({
        durationMinutes: 45,
        availabilityTimezone: 'UTC',
        workdayStartHour: 9,
        workdayEndHour: 17,
        slotIntervalMinutes: 30,
      }) as never,
    );

    expect(calendarProvider.updateEvent).toHaveBeenCalledWith({
      providerEventId: 'google-event-1',
      title: 'Call with user@example.com',
      startsAt: '2030-01-01T09:00:00.000Z',
      endsAt: '2030-01-01T09:45:00.000Z',
      attendeeEmail: 'user@example.com',
      attendeePhoneNumber: '+90 555 111 22 33',
      location: 'Zoom',
    });
    expect(callRequest.scheduledAt).toEqual(scheduledAt);
    expect(callRequest.save).toHaveBeenCalledOnce();
    expect(metricsService.increment).toHaveBeenCalledWith(
      'booking.rescheduled',
    );
    expect(response.status).toBe(CallRequestStatus.SCHEDULED);
    expect(response.scheduledAt).toBe('2030-01-01T09:00:00.000Z');
  });

  it('throws when rescheduling a scheduled call without a calendar event', async () => {
    const callRequest = mockCallRequest(CallRequestStatus.SCHEDULED);
    mockFindOne(callRequest);
    callRequestModel.exists.mockResolvedValue(null);

    await expect(
      service.rescheduleWithToken(
        'call-1',
        'cancel-token',
        {
          scheduledAt: '2030-01-01T09:00:00.000Z',
        },
        mockEventTypeRules({
          availabilityTimezone: 'UTC',
          workdayStartHour: 9,
          workdayEndHour: 17,
          slotIntervalMinutes: 30,
        }) as never,
      ),
    ).rejects.toThrow(
      'Scheduled calls without calendar events cannot be rescheduled',
    );
    expect(calendarProvider.updateEvent).not.toHaveBeenCalled();
    expect(callRequest.save).not.toHaveBeenCalled();
  });

  it('throws when rescheduling with a token that does not match a call request', async () => {
    mockFindOne(null);

    await expect(
      service.rescheduleWithToken(
        'call-1',
        'wrong-token',
        {
          scheduledAt: '2030-01-01T09:00:00.000Z',
        },
        mockEventTypeRules() as never,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws when rescheduling a non-requested or scheduled call', async () => {
    const callRequest = mockCallRequest(CallRequestStatus.CANCELED);
    mockFindOne(callRequest);

    await expect(
      service.rescheduleWithToken(
        'call-1',
        'cancel-token',
        {
          scheduledAt: '2030-01-01T09:00:00.000Z',
        },
        mockEventTypeRules() as never,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(callRequest.save).not.toHaveBeenCalled();
  });

  it('throws when the call request does not exist', async () => {
    mockFindById(null);

    await expect(service.approve('missing-call')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('throws when approving a non-requested call', async () => {
    const callRequest = mockCallRequest(CallRequestStatus.SCHEDULED);
    mockFindById(callRequest);

    await expect(service.approve('call-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(callRequest.save).not.toHaveBeenCalled();
    expect(rabbitmqPublisherService.publish).not.toHaveBeenCalled();
  });

  function mockFindById(callRequest: TestCallRequestDocument | null): void {
    callRequestModel.findById.mockReturnValue({
      exec: vi.fn().mockResolvedValue(callRequest),
    });
  }

  function mockFindOne(callRequest: TestCallRequestDocument | null): void {
    callRequestModel.findOne.mockReturnValue({
      exec: vi.fn().mockResolvedValue(callRequest),
    });
  }

  function mockAvailabilityCallRequests(
    callRequests: Array<{ scheduledAt: Date }>,
  ): void {
    callRequestModel.find.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue(callRequests),
      }),
    });
  }
});

function mockCallRequest(
  status: CallRequestStatus,
  options: {
    scheduledAt?: Date;
    calendarProviderEventId?: string;
    meetingLocation?: string;
    publicBookingHostId?: string;
    publicBookingHostSlug?: string;
    publicBookingEventTypeSlug?: string;
  } = {},
): TestCallRequestDocument {
  const scheduledAt = options.scheduledAt ?? SCHEDULED_AT;
  const callRequest = {
    id: 'call-1',
    email: 'user@example.com',
    phoneNumber: '+90 555 111 22 33',
    scheduledAt,
    status,
    adminNote: undefined,
    cancellationToken: 'cancel-token',
    calendarProviderEventId: options.calendarProviderEventId,
    meetingLocation: options.meetingLocation,
    publicBookingHostId: options.publicBookingHostId,
    publicBookingHostSlug: options.publicBookingHostSlug,
    publicBookingEventTypeSlug: options.publicBookingEventTypeSlug,
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
    save: vi.fn(),
  };

  callRequest.save.mockResolvedValue(callRequest);

  return callRequest;
}

function mockEventTypeRules(
  overrides: Partial<{
    durationMinutes: number;
    availabilityTimezone: string;
    workdayStartHour: number;
    workdayEndHour: number;
    slotIntervalMinutes: number;
    minimumNoticeMinutes: number;
    maxFutureDays: number;
    requiresApproval: boolean;
    meetingLocation: string;
    hostId: string;
    slug: string;
  }> = {},
) {
  return {
    hostId: 'host-1',
    slug: 'intro-call',
    durationMinutes: 30,
    availabilityTimezone: 'UTC',
    workdayStartHour: 8,
    workdayEndHour: 18,
    slotIntervalMinutes: 30,
    ...overrides,
  };
}
