import {
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleInit,
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

@Injectable()
export class EmailConsumerService
  implements OnModuleInit, OnApplicationShutdown
{
  private readonly logger = new Logger(EmailConsumerService.name);
  private connection?: amqp.ChannelModel;
  private channel?: amqp.Channel;

  constructor(private readonly configService: ConfigService) {}

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

  private sendCallRequestedEmail(payload: CallRequestedEvent): void {
    this.logger.log({
      template: 'CALL_REQUESTED',
      to: payload.email,
      subject: 'Your call request was received',
      body: `Your call request for ${payload.scheduledAt} was received and is waiting for admin approval.`,
      payload,
    });
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
        const payload = JSON.parse(message.content.toString()) as TPayload;

        await handler(payload);

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

  private sendCallApprovedEmail(payload: CallApprovedEvent): void {
    this.logger.log({
      template: 'CALL_APPROVED',
      to: payload.email,
      subject: 'Your call request was approved',
      body: `Your call request for ${payload.scheduledAt} was approved.`,
      payload,
    });
  }

  private sendCallRejectedEmail(payload: CallRejectedEvent): void {
    this.logger.log({
      template: 'CALL_REJECTED',
      to: payload.email,
      subject: 'Your call request was rejected',
      body: 'Your request was rejected by the admin. Please try reserving another time.',
      payload,
    });
  }

  private sendCallCanceledEmail(payload: CallCanceledEvent): void {
    this.logger.log({
      template: 'CALL_CANCELED',
      to: payload.email,
      subject: 'Your scheduled call was canceled',
      body: `Your scheduled call for ${payload.scheduledAt} was canceled.`,
      payload,
    });
  }

  private sendCallReminderEmails(payload: CallReminderEvent): void {
    const adminEmail = this.configService.getOrThrow<string>('ADMIN_EMAIL');

    this.logger.log({
      template: 'CALL_REMINDER_CUSTOMER',
      to: payload.email,
      subject: 'Reminder: your call is coming up',
      body: `Reminder: your call is scheduled for ${payload.scheduledAt}.`,
      payload,
    });

    this.logger.log({
      template: 'CALL_REMINDER_ADMIN',
      to: adminEmail,
      subject: 'Reminder: scheduled customer call',
      body: `Reminder: call with ${payload.email} / ${payload.phoneNumber} is scheduled for ${payload.scheduledAt}.`,
      payload,
    });
  }

  private sendDailyDigestEmail(payload: DailyDigestEvent): void {
    const adminEmail = this.configService.getOrThrow<string>('ADMIN_EMAIL');

    const callLines =
      payload.calls.length === 0
        ? 'No scheduled calls for today.'
        : payload.calls
            .map(
              (call, index) =>
                `${index + 1}. ${call.scheduledAt} - ${call.email} - ${
                  call.phoneNumber
                }`,
            )
            .join('\n');

    this.logger.log({
      template: 'DAILY_DIGEST',
      to: adminEmail,
      subject: `Daily call digest - ${payload.date}`,
      body: callLines,
      payload,
    });
  }
}
