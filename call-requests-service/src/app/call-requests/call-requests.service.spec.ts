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
  | 'createdAt'
  | 'updatedAt'
  | 'save'
>;

describe('CallRequestsService', () => {
  let callRequestModel: {
    create: ReturnType<typeof vi.fn>;
    exists: ReturnType<typeof vi.fn>;
    findById: ReturnType<typeof vi.fn>;
    find: ReturnType<typeof vi.fn>;
  };
  let rabbitmqPublisherService: {
    publish: ReturnType<typeof vi.fn>;
  };
  let calendarProvider: {
    getBusySlots: ReturnType<typeof vi.fn>;
    createEvent: ReturnType<typeof vi.fn>;
    cancelEvent: ReturnType<typeof vi.fn>;
  };
  let eventTypesService: {
    findDefaultActiveEventType: ReturnType<typeof vi.fn>;
  };
  let service: CallRequestsService;

  beforeEach(() => {
    callRequestModel = {
      create: vi.fn(),
      exists: vi.fn(),
      findById: vi.fn(),
      find: vi.fn(),
    };
    rabbitmqPublisherService = {
      publish: vi.fn().mockResolvedValue(undefined),
    };
    calendarProvider = {
      getBusySlots: vi.fn().mockResolvedValue([]),
      createEvent: vi.fn().mockResolvedValue({}),
      cancelEvent: vi.fn().mockResolvedValue(undefined),
    };
    eventTypesService = {
      findDefaultActiveEventType: vi.fn().mockResolvedValue(null),
    };

    service = new CallRequestsService(
      callRequestModel as unknown as Model<CallRequestDocument>,
      rabbitmqPublisherService as unknown as RabbitmqPublisherService,
      calendarProvider as unknown as CalendarProvider,
      eventTypesService as unknown as EventTypesService,
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

  it('approves requested calls and publishes an approval event', async () => {
    const callRequest = mockCallRequest(CallRequestStatus.REQUESTED);
    mockFindById(callRequest);

    const response = await service.approve('call-1');

    expect(callRequest.status).toBe(CallRequestStatus.SCHEDULED);
    expect(callRequest.save).toHaveBeenCalledOnce();
    expect(calendarProvider.createEvent).toHaveBeenCalledWith({
      title: 'Call with user@example.com',
      startsAt: '2026-05-15T07:00:00.000Z',
      endsAt: '2026-05-15T07:30:00.000Z',
      attendeeEmail: 'user@example.com',
      attendeePhoneNumber: '+90 555 111 22 33',
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
    expect(response.status).toBe(CallRequestStatus.REJECTED);
  });

  it('marks scheduled calls as called without publishing an event', async () => {
    const callRequest = mockCallRequest(CallRequestStatus.SCHEDULED);
    mockFindById(callRequest);

    const response = await service.markAsCalled('call-1');

    expect(callRequest.status).toBe(CallRequestStatus.CALLED);
    expect(callRequest.save).toHaveBeenCalledOnce();
    expect(rabbitmqPublisherService.publish).not.toHaveBeenCalled();
    expect(response.status).toBe(CallRequestStatus.CALLED);
  });

  it('cancels scheduled calls and publishes a cancellation event', async () => {
    const callRequest = mockCallRequest(CallRequestStatus.SCHEDULED);
    mockFindById(callRequest);

    const response = await service.cancel('call-1');

    expect(callRequest.status).toBe(CallRequestStatus.CANCELED);
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

function mockCallRequest(status: CallRequestStatus): TestCallRequestDocument {
  const callRequest = {
    id: 'call-1',
    email: 'user@example.com',
    phoneNumber: '+90 555 111 22 33',
    scheduledAt: SCHEDULED_AT,
    status,
    adminNote: undefined,
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
  }> = {},
) {
  return {
    durationMinutes: 30,
    availabilityTimezone: 'UTC',
    workdayStartHour: 8,
    workdayEndHour: 18,
    slotIntervalMinutes: 30,
    ...overrides,
  };
}
