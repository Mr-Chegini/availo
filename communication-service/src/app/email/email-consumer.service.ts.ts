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
import type { CallRequestedEvent } from '@org/shared-types';
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

    const queue = this.configService.get<string>(
      'RABBITMQ_CALL_REQUESTED_QUEUE',
      'communication.call-requested',
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
      RabbitmqRoutingKey.CALL_REQUESTED,
    );

    await this.channel.consume(queue, async (message) => {
      if (!message) {
        return;
      }

      try {
        const payload = JSON.parse(
          message.content.toString(),
        ) as CallRequestedEvent;

        this.sendCallRequestedEmail(payload);

        this.channel?.ack(message);
      } catch (error) {
        this.logger.error('Failed to process call requested email', error);
        this.channel?.nack(message, false, false);
      }
    });

    this.logger.log(
      `Listening for ${RabbitmqRoutingKey.CALL_REQUESTED} on queue ${queue}`,
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
}