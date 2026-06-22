import {
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqplib';
import { RabbitmqExchange } from '@org/shared-types';
import { createStructuredLog } from '../logging/structured-log';
import { MetricsService } from '../metrics/metrics.service';

@Injectable()
export class RabbitmqPublisherService
  implements OnModuleInit, OnApplicationShutdown
{
  private readonly logger = new Logger(RabbitmqPublisherService.name);
  private connection?: amqp.ChannelModel;
  private channel?: amqp.Channel;

  constructor(
    private readonly configService: ConfigService,
    private readonly metricsService: MetricsService,
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

    this.logger.log(
      createStructuredLog('rabbitmq.connected', {
        exchange,
      }),
    );
  }

  async publish<TPayload>(
    routingKey: string,
    payload: TPayload,
  ): Promise<void> {
    if (!this.channel) {
      this.metricsService.increment('rabbitmq.publish_failed');
      throw new Error('RabbitMQ channel is not initialized');
    }

    const exchange = this.configService.get<string>(
      'RABBITMQ_CALLS_EXCHANGE',
      RabbitmqExchange.CALLS,
    );

    let accepted: boolean;

    try {
      accepted = this.channel.publish(
        exchange,
        routingKey,
        Buffer.from(JSON.stringify(payload)),
        {
          contentType: 'application/json',
          persistent: true,
        },
      );
    } catch (error) {
      this.metricsService.increment('rabbitmq.publish_failed');
      throw error;
    }

    this.logger.log(
      createStructuredLog('rabbitmq.message_published', {
        exchange,
        routingKey,
        accepted,
      }),
    );
  }

  isReady(): boolean {
    return Boolean(this.connection && this.channel);
  }

  async onApplicationShutdown() {
    const channel = this.channel;
    const connection = this.connection;

    this.channel = undefined;
    this.connection = undefined;

    await channel?.close();
    await connection?.close();
  }
}
