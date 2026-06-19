import { ConflictException, NotFoundException } from '@nestjs/common';
import type { Model } from 'mongoose';
import { CallRequestStatus, RabbitmqRoutingKey } from '@org/shared-types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RabbitmqPublisherService } from '../messaging/rabbitmq-publisher.service';
import { CallRequestsService } from './call-requests.service';
import type { CallRequestDocument } from './call-request.schema';
import type { CalendarProvider } from '../calendar/calendar-provider';

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
  let service: CallRequestsService;

  beforeEach(() => {
    callRequestModel = {
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

    service = new CallRequestsService(
      callRequestModel as unknown as Model<CallRequestDocument>,
      rabbitmqPublisherService as unknown as RabbitmqPublisherService,
      calendarProvider as unknown as CalendarProvider,
    );
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
