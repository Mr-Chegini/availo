import { RabbitmqRoutingKey } from '@org/shared-types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SchedulerMetricsService } from '../metrics/metrics.service';
import { SchedulerCallsService } from './scheduler-calls.service';

describe('SchedulerCallsService metrics', () => {
  let schedulerCallModel: {
    find: ReturnType<typeof vi.fn>;
    updateOne: ReturnType<typeof vi.fn>;
  };
  let rabbitmqPublisherService: {
    publish: ReturnType<typeof vi.fn>;
  };
  let metricsService: SchedulerMetricsService;

  beforeEach(() => {
    schedulerCallModel = {
      find: vi.fn(),
      updateOne: vi.fn().mockResolvedValue({ modifiedCount: 1 }),
    };
    rabbitmqPublisherService = {
      publish: vi.fn().mockResolvedValue(undefined),
    };
    metricsService = new SchedulerMetricsService();
  });

  it('increments reminder publish success after a reminder is published', async () => {
    const call = createSchedulerCall();
    schedulerCallModel.find.mockReturnValue({
      exec: vi.fn().mockResolvedValue([call]),
    });
    const service = createService();

    await service.publishDueReminderEvents();

    expect(rabbitmqPublisherService.publish).toHaveBeenCalledWith(
      RabbitmqRoutingKey.CALL_REMINDER,
      {
        callRequestId: 'call-1',
        email: 'user@example.com',
        phoneNumber: '+90 555 111 22 33',
        scheduledAt: '2030-01-01T10:00:00.000Z',
      },
    );
    expect(call.reminderSent).toBe(true);
    expect(call.save).toHaveBeenCalledOnce();
    expect(metricsService.snapshot().counters).toMatchObject({
      'scheduler.reminder_publish_success': 1,
      'scheduler.reminder_publish_failure': 0,
    });
  });

  it('increments reminder publish failure when reminder publishing fails', async () => {
    const call = createSchedulerCall();
    schedulerCallModel.find.mockReturnValue({
      exec: vi.fn().mockResolvedValue([call]),
    });
    rabbitmqPublisherService.publish.mockRejectedValue(
      new Error('Rabbit down'),
    );
    const service = createService();

    await expect(service.publishDueReminderEvents()).rejects.toThrow(
      'Rabbit down',
    );
    expect(call.save).not.toHaveBeenCalled();
    expect(metricsService.snapshot().counters).toMatchObject({
      'scheduler.reminder_publish_success': 0,
      'scheduler.reminder_publish_failure': 1,
    });
  });

  it('increments daily digest publish success after a digest is published', async () => {
    schedulerCallModel.find.mockReturnValue({
      sort: vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue([createSchedulerCall()]),
      }),
    });
    const service = createService();

    await service.publishDailyDigestEvent();

    expect(rabbitmqPublisherService.publish).toHaveBeenCalledWith(
      RabbitmqRoutingKey.DAILY_DIGEST,
      expect.objectContaining({
        calls: [
          {
            callRequestId: 'call-1',
            email: 'user@example.com',
            phoneNumber: '+90 555 111 22 33',
            scheduledAt: '2030-01-01T10:00:00.000Z',
          },
        ],
      }),
    );
    expect(metricsService.snapshot().counters).toMatchObject({
      'scheduler.daily_digest_publish_success': 1,
      'scheduler.daily_digest_publish_failure': 0,
    });
  });

  it('increments daily digest publish failure when digest publishing fails', async () => {
    schedulerCallModel.find.mockReturnValue({
      sort: vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue([createSchedulerCall()]),
      }),
    });
    rabbitmqPublisherService.publish.mockRejectedValue(
      new Error('Rabbit down'),
    );
    const service = createService();

    await expect(service.publishDailyDigestEvent()).rejects.toThrow(
      'Rabbit down',
    );
    expect(metricsService.snapshot().counters).toMatchObject({
      'scheduler.daily_digest_publish_success': 0,
      'scheduler.daily_digest_publish_failure': 1,
    });
  });

  it('updates scheduler projection when a scheduled call is rescheduled', async () => {
    const service = createService();

    await service.handleCallRescheduled({
      callRequestId: 'call-1',
      email: 'user@example.com',
      phoneNumber: '+90 555 111 22 33',
      scheduledAt: '2030-01-01T11:00:00.000Z',
    });

    expect(schedulerCallModel.updateOne).toHaveBeenCalledWith(
      { callRequestId: 'call-1' },
      {
        $set: {
          callRequestId: 'call-1',
          email: 'user@example.com',
          phoneNumber: '+90 555 111 22 33',
          scheduledAt: new Date('2030-01-01T11:00:00.000Z'),
          reminderSent: false,
        },
      },
      { upsert: true },
    );
  });

  function createService(): SchedulerCallsService {
    return new SchedulerCallsService(
      schedulerCallModel as never,
      rabbitmqPublisherService as never,
      metricsService,
    );
  }
});

function createSchedulerCall() {
  return {
    callRequestId: 'call-1',
    email: 'user@example.com',
    phoneNumber: '+90 555 111 22 33',
    scheduledAt: new Date('2030-01-01T10:00:00.000Z'),
    reminderSent: false,
    save: vi.fn().mockResolvedValue(undefined),
  };
}
