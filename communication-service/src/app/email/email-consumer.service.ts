import {
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleInit,
  Inject,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RabbitmqExchange, RabbitmqRoutingKey } from '@org/shared-types';
import type {
  CallApprovedEvent,
  CallCanceledEvent,
  CallRejectedEvent,
  CallReminderEvent,
  CallRequestedEvent,
  DailyDigestEvent,
} from '@org/shared-types';
import * as amqp from 'amqplib';
import {
  EMAIL_SENDER,
  type EmailMessage,
  type EmailSender,
} from './email-sender';
import {
  buildCallApprovedEmail,
  buildCallCanceledEmail,
  buildCallRejectedEmail,
  buildCallReminderEmails,
  buildCallRequestedEmail,
  buildDailyDigestEmail,
} from './email-templates';
import { createEmailIdempotencyKey } from './email-idempotency-key';
import { ProcessedEmailEventsService } from './processed-email-events.service';

@Injectable()
export class EmailConsumerService
  implements OnModuleInit, OnApplicationShutdown
{
  private readonly logger = new Logger(EmailConsumerService.name);
  private connection?: amqp.ChannelModel;
  private channel?: amqp.Channel;

  constructor(
    private readonly configService: ConfigService,
    @Inject(EMAIL_SENDER) private readonly emailSender: EmailSender,
    private readonly processedEmailEventsService: ProcessedEmailEventsService,
  ) {}

  async onModuleInit() {
    const rabbitmqUrl = this.configService.getOrThrow<string>('RABBITMQ_URL');

    const exchange = this.configService.get<string>(
      'RABBITMQ_CALLS_EXCHANGE',
      RabbitmqExchange.CALLS,
    );

    this.connection = await amqp.connect(rabbitmqUrl);
    this.channel = await this.connection.createChannel();

    await this.channel.assertExchange(exchange, 'topic', {
      durable: true,
    });

    const callRequestedQueue = this.configService.get<string>(
      'RABBITMQ_CALL_REQUESTED_QUEUE',
      'communication.call-requested',
    );

    const callApprovedQueue = this.configService.get<string>(
      'RABBITMQ_CALL_APPROVED_QUEUE',
      'communication.call-approved',
    );

    const callRejectedQueue = this.configService.get<string>(
      'RABBITMQ_CALL_REJECTED_QUEUE',
      'communication.call-rejected',
    );

    const callCanceledQueue = this.configService.get<string>(
      'RABBITMQ_CALL_CANCELED_QUEUE',
      'communication.call-canceled',
    );

    const callReminderQueue = this.configService.get<string>(
      'RABBITMQ_CALL_REMINDER_QUEUE',
      'communication.call-reminder',
    );

    const dailyDigestQueue = this.configService.get<string>(
      'RABBITMQ_DAILY_DIGEST_QUEUE',
      'communication.daily-digest',
    );

    await this.bindAndConsumeQueue<CallRequestedEvent>(
      callRequestedQueue,
      RabbitmqRoutingKey.CALL_REQUESTED,
      (payload) => this.sendCallRequestedEmail(payload),
    );

    await this.bindAndConsumeQueue<CallApprovedEvent>(
      callApprovedQueue,
      RabbitmqRoutingKey.CALL_APPROVED,
      (payload) => this.sendCallApprovedEmail(payload),
    );

    await this.bindAndConsumeQueue<CallRejectedEvent>(
      callRejectedQueue,
      RabbitmqRoutingKey.CALL_REJECTED,
      (payload) => this.sendCallRejectedEmail(payload),
    );

    await this.bindAndConsumeQueue<CallCanceledEvent>(
      callCanceledQueue,
      RabbitmqRoutingKey.CALL_CANCELED,
      (payload) => this.sendCallCanceledEmail(payload),
    );

    await this.bindAndConsumeQueue<CallReminderEvent>(
      callReminderQueue,
      RabbitmqRoutingKey.CALL_REMINDER,
      (payload) => this.sendCallReminderEmails(payload),
    );

    await this.bindAndConsumeQueue<DailyDigestEvent>(
      dailyDigestQueue,
      RabbitmqRoutingKey.DAILY_DIGEST,
      (payload) => this.sendDailyDigestEmail(payload),
    );
  }

  private async sendCallRequestedEmail(
    payload: CallRequestedEvent,
  ): Promise<void> {
    await this.emailSender.send(
      buildCallRequestedEmail(payload, this.getPublicBookingBaseUrl()),
    );
  }

  async onApplicationShutdown() {
    await this.channel?.close();
    await this.connection?.close();
  }

  private async bindAndConsumeQueue<TPayload>(
    queue: string,
    routingKey: RabbitmqRoutingKey,
    handler: (payload: TPayload) => Promise<void> | void,
  ): Promise<void> {
    if (!this.channel) {
      throw new Error('RabbitMQ channel is not initialized');
    }

    const exchange = this.configService.get<string>(
      'RABBITMQ_CALLS_EXCHANGE',
      RabbitmqExchange.CALLS,
    );

    await this.channel.assertQueue(queue, {
      durable: true,
    });

    await this.channel.bindQueue(queue, exchange, routingKey);

    await this.channel.consume(queue, async (message) => {
      if (!message) {
        return;
      }

      try {
        const idempotencyKey = createEmailIdempotencyKey(
          routingKey,
          message.content,
        );

        if (
          await this.processedEmailEventsService.hasProcessed(idempotencyKey)
        ) {
          this.logger.log(`Skipping duplicate email event ${idempotencyKey}`);
          this.channel?.ack(message);
          return;
        }

        const payload = JSON.parse(message.content.toString()) as TPayload;
        await handler(payload);
        await this.processedEmailEventsService.markProcessed(
          idempotencyKey,
          routingKey,
        );

        this.channel?.ack(message);
      } catch (error) {
        this.logger.error(
          `Failed to process message from queue ${queue}`,
          error,
        );
        this.channel?.nack(message, false, false);
      }
    });

    this.logger.log(`Listening for ${routingKey} on queue ${queue}`);
  }

  private async sendCallApprovedEmail(
    payload: CallApprovedEvent,
  ): Promise<void> {
    await this.emailSender.send(
      buildCallApprovedEmail(payload, this.getPublicBookingBaseUrl()),
    );
  }

  private async sendCallRejectedEmail(
    payload: CallRejectedEvent,
  ): Promise<void> {
    await this.emailSender.send(buildCallRejectedEmail(payload));
  }

  private async sendCallCanceledEmail(
    payload: CallCanceledEvent,
  ): Promise<void> {
    await this.emailSender.send(buildCallCanceledEmail(payload));
  }

  private async sendCallReminderEmails(
    payload: CallReminderEvent,
  ): Promise<void> {
    const adminEmail = this.configService.getOrThrow<string>('ADMIN_EMAIL');

    await this.sendEmails(buildCallReminderEmails(payload, adminEmail));
  }

  private async sendDailyDigestEmail(payload: DailyDigestEvent): Promise<void> {
    const adminEmail = this.configService.getOrThrow<string>('ADMIN_EMAIL');

    await this.emailSender.send(buildDailyDigestEmail(payload, adminEmail));
  }

  private async sendEmails(messages: EmailMessage[]): Promise<void> {
    for (const message of messages) {
      await this.emailSender.send(message);
    }
  }

  private getPublicBookingBaseUrl(): string | undefined {
    return this.configService.get<string>('PUBLIC_BOOKING_BASE_URL');
  }
}
