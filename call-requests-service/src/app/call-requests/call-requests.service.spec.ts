import { ConflictException, NotFoundException } from '@nestjs/common';
import type { Model } from 'mongoose';
import {
  CallRequestStatus,
  RabbitmqRoutingKey,
} from '@org/shared-types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RabbitmqPublisherService } from '../messaging/rabbitmq-publisher.service';
import { CallRequestsService } from './call-requests.service';
import type { CallRequestDocument } from './call-request.schema';

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

describe('CallRequestsService status transitions', () => {
  let callRequestModel: {
    findById: ReturnType<typeof vi.fn>;
  };
  let rabbitmqPublisherService: {
    publish: ReturnType<typeof vi.fn>;
  };
  let service: CallRequestsService;

  beforeEach(() => {
    callRequestModel = {
      findById: vi.fn(),
    };
    rabbitmqPublisherService = {
      publish: vi.fn().mockResolvedValue(undefined),
    };

    service = new CallRequestsService(
      callRequestModel as unknown as Model<CallRequestDocument>,
      rabbitmqPublisherService as unknown as RabbitmqPublisherService,
    );
  });

  it('approves requested calls and publishes an approval event', async () => {
    const callRequest = mockCallRequest(CallRequestStatus.REQUESTED);
    mockFindById(callRequest);

    const response = await service.approve('call-1');

    expect(callRequest.status).toBe(CallRequestStatus.SCHEDULED);
    expect(callRequest.save).toHaveBeenCalledOnce();
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
});

function mockCallRequest(
  status: CallRequestStatus,
): TestCallRequestDocument {
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
