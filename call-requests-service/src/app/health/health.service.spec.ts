import type { Connection } from 'mongoose';
import { describe, expect, it } from 'vitest';
import type { RabbitmqPublisherService } from '../messaging/rabbitmq-publisher.service';
import { HealthService } from './health.service';

describe('HealthService', () => {
  it('reports ok when MongoDB is connected and RabbitMQ is ready', () => {
    const service = new HealthService(
      createMongooseConnection(1),
      createRabbitmqPublisher(true),
    );

    expect(service.check()).toMatchObject({
      service: 'call-requests-service',
      status: 'ok',
      checks: {
        mongodb: {
          status: 'up',
          readyState: 1,
          readyStateName: 'connected',
        },
        rabbitmq: {
          status: 'up',
        },
      },
    });
  });

  it('reports error when MongoDB is not connected', () => {
    const service = new HealthService(
      createMongooseConnection(0),
      createRabbitmqPublisher(true),
    );

    expect(service.check()).toMatchObject({
      status: 'error',
      checks: {
        mongodb: {
          status: 'down',
          readyState: 0,
          readyStateName: 'disconnected',
        },
        rabbitmq: {
          status: 'up',
        },
      },
    });
  });

  it('reports error when RabbitMQ is not ready', () => {
    const service = new HealthService(
      createMongooseConnection(1),
      createRabbitmqPublisher(false),
    );

    expect(service.check()).toMatchObject({
      status: 'error',
      checks: {
        mongodb: {
          status: 'up',
        },
        rabbitmq: {
          status: 'down',
        },
      },
    });
  });
});

function createMongooseConnection(readyState: number): Connection {
  return {
    readyState,
  } as Connection;
}

function createRabbitmqPublisher(isReady: boolean): RabbitmqPublisherService {
  return {
    isReady: () => isReady,
  } as RabbitmqPublisherService;
}
