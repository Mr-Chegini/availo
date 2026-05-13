import {
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  RabbitmqExchange,
  RabbitmqRoutingKey,
} from '@org/shared-types';
import type { CallApprovedEvent } from '@org/shared-types';
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

    const queue = this.configService.get<string>(
      'RABBITMQ_CALL_APPROVED_SCHEDULER_QUEUE',
      'scheduler.call-approved',
    );

    this.connection = await amqp.connect(rabbitmqUrl);
    this.channel = await this.connection.createChannel();

    await this.channel.assertExchange(exchange, 'topic', {
      durable: true,
    });

    await this.channel.assertQueue(queue, {
      durable: true,
    });

    await this.channel.bindQueue(
      queue,
      exchange,
      RabbitmqRoutingKey.CALL_APPROVED,
    );

    await this.channel.consume(queue, async (message) => {
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
      `Listening for ${RabbitmqRoutingKey.CALL_APPROVED} on queue ${queue}`,
    );
  }

  async onApplicationShutdown() {
    await this.channel?.close();
    await this.connection?.close();
  }
}