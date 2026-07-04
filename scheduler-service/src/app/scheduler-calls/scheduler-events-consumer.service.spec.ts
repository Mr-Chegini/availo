import type { ConfigService } from '@nestjs/config';
import { RabbitmqRoutingKey } from '@org/shared-types';
import * as amqp from 'amqplib';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SchedulerCallsService } from './scheduler-calls.service';
import { SchedulerEventsConsumerService } from './scheduler-events-consumer.service';

vi.mock('amqplib', () => ({
  connect: vi.fn(),
}));

describe('SchedulerEventsConsumerService', () => {
  let channel: MockChannel;
  let consumers: Record<
    string,
    (message: amqp.ConsumeMessage) => Promise<void>
  >;
  let schedulerCallsService: SchedulerCallsService;

  beforeEach(() => {
    consumers = {};
    channel = createMockChannel(consumers);
    schedulerCallsService = {
      handleCallApproved: vi.fn().mockResolvedValue(undefined),
      handleCallCanceled: vi.fn().mockResolvedValue(undefined),
      handleCallRescheduled: vi.fn().mockResolvedValue(undefined),
    } as unknown as SchedulerCallsService;

    vi.mocked(amqp.connect).mockResolvedValue({
      createChannel: vi.fn().mockResolvedValue(channel),
      close: vi.fn().mockResolvedValue(undefined),
    } as unknown as amqp.ChannelModel);
  });

  it('binds and consumes rescheduled call events', async () => {
    const service = new SchedulerEventsConsumerService(
      createConfigService(),
      schedulerCallsService,
    );

    await service.onModuleInit();

    expect(channel.bindQueue).toHaveBeenCalledWith(
      'scheduler.call-rescheduled',
      'calls.exchange',
      RabbitmqRoutingKey.CALL_RESCHEDULED,
    );

    const message = createMessage({
      callRequestId: 'call-1',
      email: 'user@example.com',
      phoneNumber: '+90 555 111 22 33',
      scheduledAt: '2030-01-01T11:00:00.000Z',
    });
    await consumers['scheduler.call-rescheduled'](message);

    expect(schedulerCallsService.handleCallRescheduled).toHaveBeenCalledWith({
      callRequestId: 'call-1',
      email: 'user@example.com',
      phoneNumber: '+90 555 111 22 33',
      scheduledAt: '2030-01-01T11:00:00.000Z',
    });
    expect(channel.ack).toHaveBeenCalledWith(message);
    expect(channel.nack).not.toHaveBeenCalled();
  });
});

interface MockChannel {
  assertExchange: ReturnType<typeof vi.fn>;
  assertQueue: ReturnType<typeof vi.fn>;
  bindQueue: ReturnType<typeof vi.fn>;
  consume: ReturnType<typeof vi.fn>;
  ack: ReturnType<typeof vi.fn>;
  nack: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
}

function createMockChannel(
  consumers: Record<string, (message: amqp.ConsumeMessage) => Promise<void>>,
): MockChannel {
  return {
    assertExchange: vi.fn().mockResolvedValue(undefined),
    assertQueue: vi.fn().mockResolvedValue(undefined),
    bindQueue: vi.fn().mockResolvedValue(undefined),
    consume: vi.fn().mockImplementation((queue, consumer) => {
      consumers[queue] = consumer;
      return Promise.resolve({ consumerTag: queue });
    }),
    ack: vi.fn(),
    nack: vi.fn(),
    close: vi.fn().mockResolvedValue(undefined),
  };
}

function createMessage(payload: Record<string, unknown>): amqp.ConsumeMessage {
  return {
    content: Buffer.from(JSON.stringify(payload)),
  } as amqp.ConsumeMessage;
}

function createConfigService(): ConfigService {
  const values: Record<string, string> = {
    RABBITMQ_URL: 'amqp://localhost',
    RABBITMQ_CALLS_EXCHANGE: 'calls.exchange',
    RABBITMQ_CALL_APPROVED_SCHEDULER_QUEUE: 'scheduler.call-approved',
    RABBITMQ_CALL_CANCELED_SCHEDULER_QUEUE: 'scheduler.call-canceled',
    RABBITMQ_CALL_RESCHEDULED_SCHEDULER_QUEUE: 'scheduler.call-rescheduled',
  };

  return {
    get: vi.fn((key: string, defaultValue?: unknown) => {
      return values[key] ?? defaultValue;
    }),
    getOrThrow: vi.fn((key: string) => {
      const value = values[key];

      if (value === undefined) {
        throw new Error(`Missing config value ${key}`);
      }

      return value;
    }),
  } as unknown as ConfigService;
}
