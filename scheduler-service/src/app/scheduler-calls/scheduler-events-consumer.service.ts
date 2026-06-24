import {
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RabbitmqExchange, RabbitmqRoutingKey } from '@org/shared-types';
import type { CallApprovedEvent, CallCanceledEvent } from '@org/shared-types';
import * as amqp from 'amqplib';
import { SchedulerCallsService } from './scheduler-calls.service';

@Injectable()
export class SchedulerEventsConsumerService
  implements OnModuleInit, OnApplicationShutdown
{
  private readonly logger = new Logger(SchedulerEventsConsumerService.name);
  private connection?: amqp.ChannelModel;
  private channel?: amqp.Channel;

  constructor(
    private readonly configService: ConfigService,
    private readonly schedulerCallsService: SchedulerCallsService,
  ) {}

  async onModuleInit() {
    const rabbitmqUrl = this.configService.getOrThrow<string>('RABBITMQ_URL');

    const exchange = this.configService.get<string>(
      'RABBITMQ_CALLS_EXCHANGE',
      RabbitmqExchange.CALLS,
    );

    const approvedQueue = this.configService.get<string>(
      'RABBITMQ_CALL_APPROVED_SCHEDULER_QUEUE',
      'scheduler.call-approved',
    );

    const canceledQueue = this.configService.get<string>(
      'RABBITMQ_CALL_CANCELED_SCHEDULER_QUEUE',
      'scheduler.call-canceled',
    );

    this.connection = await amqp.connect(rabbitmqUrl);
    this.channel = await this.connection.createChannel();

    await this.channel.assertExchange(exchange, 'topic', {
      durable: true,
    });

    await this.channel.assertQueue(approvedQueue, {
      durable: true,
    });

    await this.channel.bindQueue(
      approvedQueue,
      exchange,
      RabbitmqRoutingKey.CALL_APPROVED,
    );

    await this.channel.consume(approvedQueue, async (message) => {
      if (!message) {
        return;
      }

      try {
        const payload = JSON.parse(
          message.content.toString(),
        ) as CallApprovedEvent;

        await this.schedulerCallsService.handleCallApproved(payload);

        this.channel?.ack(message);
      } catch (error) {
        this.logger.error('Failed to process call approved event', error);
        this.channel?.nack(message, false, false);
      }
    });

    this.logger.log(
      `Listening for ${RabbitmqRoutingKey.CALL_APPROVED} on queue ${approvedQueue}`,
    );

    await this.channel.assertQueue(canceledQueue, {
      durable: true,
    });

    await this.channel.bindQueue(
      canceledQueue,
      exchange,
      RabbitmqRoutingKey.CALL_CANCELED,
    );

    await this.channel.consume(canceledQueue, async (message) => {
      if (!message) {
        return;
      }

      try {
        const payload = JSON.parse(
          message.content.toString(),
        ) as CallCanceledEvent;

        await this.schedulerCallsService.handleCallCanceled(
          payload.callRequestId,
        );

        this.channel?.ack(message);
      } catch (error) {
        this.logger.error('Failed to process call canceled event', error);
        this.channel?.nack(message, false, false);
      }
    });

    this.logger.log(
      `Listening for ${RabbitmqRoutingKey.CALL_CANCELED} on queue ${canceledQueue}`,
    );
  }

  async onApplicationShutdown() {
    await this.channel?.close();
    await this.connection?.close();
  }
}
