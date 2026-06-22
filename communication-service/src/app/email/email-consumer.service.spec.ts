import type { ConfigService } from '@nestjs/config';
import { RabbitmqRoutingKey } from '@org/shared-types';
import * as amqp from 'amqplib';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EmailSender } from './email-sender';
import { EmailConsumerService } from './email-consumer.service';
import type { ProcessedEmailEventsService } from './processed-email-events.service';

vi.mock('amqplib', () => ({
  connect: vi.fn(),
}));

describe('EmailConsumerService', () => {
  let channel: MockChannel;
  let consumers: Record<
    string,
    (message: amqp.ConsumeMessage) => Promise<void>
  >;
  let emailSender: EmailSender;
  let processedEmailEventsService: ProcessedEmailEventsService;

  beforeEach(() => {
    consumers = {};
    channel = createMockChannel(consumers);
    emailSender = {
      send: vi.fn(),
    };
    processedEmailEventsService = {
      hasProcessed: vi.fn().mockResolvedValue(false),
      markProcessed: vi.fn().mockResolvedValue(undefined),
    } as unknown as ProcessedEmailEventsService;

    vi.mocked(amqp.connect).mockResolvedValue({
      createChannel: vi.fn().mockResolvedValue(channel),
      close: vi.fn().mockResolvedValue(undefined),
    } as unknown as amqp.ChannelModel);
  });

  it('retries failed email events with an incremented retry header', async () => {
    vi.mocked(emailSender.send).mockRejectedValue(new Error('smtp down'));
    const service = createService();

    await service.onModuleInit();

    const message = createMessage();
    await consumers['communication.call-requested'](message);

    expect(channel.sendToQueue).toHaveBeenCalledWith(
      'communication.call-requested',
      message.content,
      expect.objectContaining({
        persistent: true,
        contentType: 'application/json',
        headers: expect.objectContaining({
          'x-email-retry-count': 1,
          'x-email-original-routing-key': RabbitmqRoutingKey.CALL_REQUESTED,
          'x-email-last-error': 'smtp down',
        }),
      }),
    );
    expect(channel.ack).toHaveBeenCalledWith(message);
    expect(channel.nack).not.toHaveBeenCalled();
    expect(processedEmailEventsService.markProcessed).not.toHaveBeenCalled();
  });

  it('dead-letters failed email events after retry attempts are exhausted', async () => {
    vi.mocked(emailSender.send).mockRejectedValue(new Error('smtp down'));
    const service = createService();

    await service.onModuleInit();

    const message = createMessage({ 'x-email-retry-count': 3 });
    await consumers['communication.call-requested'](message);

    expect(channel.sendToQueue).toHaveBeenCalledWith(
      'communication.email-dead-letter',
      expect.any(Buffer),
      expect.objectContaining({
        persistent: true,
        contentType: 'application/json',
        headers: expect.objectContaining({
          'x-email-retry-count': 3,
          'x-email-original-routing-key': RabbitmqRoutingKey.CALL_REQUESTED,
          'x-email-last-error': 'smtp down',
        }),
      }),
    );

    const deadLetterPayload = JSON.parse(
      channel.sendToQueue.mock.calls[0]?.[1].toString() ?? '{}',
    ) as Record<string, unknown>;

    expect(deadLetterPayload).toMatchObject({
      queue: 'communication.call-requested',
      routingKey: RabbitmqRoutingKey.CALL_REQUESTED,
      attempts: 3,
      error: 'smtp down',
      payload: message.content.toString(),
    });
    expect(deadLetterPayload.failedAt).toEqual(expect.any(String));
    expect(channel.ack).toHaveBeenCalledWith(message);
    expect(channel.nack).not.toHaveBeenCalled();
    expect(processedEmailEventsService.markProcessed).not.toHaveBeenCalled();
  });

  function createService(): EmailConsumerService {
    return new EmailConsumerService(
      createConfigService(),
      emailSender,
      processedEmailEventsService,
    );
  }
});

interface MockChannel {
  assertExchange: ReturnType<typeof vi.fn>;
  assertQueue: ReturnType<typeof vi.fn>;
  bindQueue: ReturnType<typeof vi.fn>;
  consume: ReturnType<typeof vi.fn>;
  ack: ReturnType<typeof vi.fn>;
  nack: ReturnType<typeof vi.fn>;
  sendToQueue: ReturnType<typeof vi.fn>;
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
    sendToQueue: vi.fn(),
    close: vi.fn().mockResolvedValue(undefined),
  };
}

function createMessage(
  headers: Record<string, unknown> = {},
): amqp.ConsumeMessage {
  return {
    content: Buffer.from(
      JSON.stringify({
        callRequestId: 'call-1',
        email: 'user@example.com',
        phoneNumber: '+90 555 111 22 33',
        scheduledAt: '2026-05-15T07:00:00.000Z',
      }),
    ),
    properties: {
      contentType: 'application/json',
      headers,
    },
  } as amqp.ConsumeMessage;
}

function createConfigService(): ConfigService {
  const values: Record<string, string | number> = {
    RABBITMQ_URL: 'amqp://localhost',
    RABBITMQ_CALLS_EXCHANGE: 'calls.exchange',
    RABBITMQ_EMAIL_DEAD_LETTER_QUEUE: 'communication.email-dead-letter',
    EMAIL_MAX_RETRY_ATTEMPTS: 3,
    ADMIN_EMAIL: 'admin@example.com',
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
