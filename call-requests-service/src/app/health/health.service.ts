import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';
import { RabbitmqPublisherService } from '../messaging/rabbitmq-publisher.service';

export type DependencyHealthStatus = 'up' | 'down';

export type HealthCheckResponse = {
  service: 'call-requests-service';
  status: 'ok' | 'error';
  timestamp: string;
  checks: {
    mongodb: {
      status: DependencyHealthStatus;
      readyState: number;
      readyStateName: string;
    };
    rabbitmq: {
      status: DependencyHealthStatus;
    };
  };
};

@Injectable()
export class HealthService {
  constructor(
    @InjectConnection() private readonly mongooseConnection: Connection,
    private readonly rabbitmqPublisherService: RabbitmqPublisherService,
  ) {}

  check(): HealthCheckResponse {
    const mongodbReadyState = this.mongooseConnection.readyState;
    const mongodbIsUp = mongodbReadyState === 1;
    const rabbitmqIsUp = this.rabbitmqPublisherService.isReady();

    return {
      service: 'call-requests-service',
      status: mongodbIsUp && rabbitmqIsUp ? 'ok' : 'error',
      timestamp: new Date().toISOString(),
      checks: {
        mongodb: {
          status: mongodbIsUp ? 'up' : 'down',
          readyState: mongodbReadyState,
          readyStateName: getMongooseReadyStateName(mongodbReadyState),
        },
        rabbitmq: {
          status: rabbitmqIsUp ? 'up' : 'down',
        },
      },
    };
  }
}

function getMongooseReadyStateName(readyState: number): string {
  switch (readyState) {
    case 0:
      return 'disconnected';
    case 1:
      return 'connected';
    case 2:
      return 'connecting';
    case 3:
      return 'disconnecting';
    default:
      return 'unknown';
  }
}
