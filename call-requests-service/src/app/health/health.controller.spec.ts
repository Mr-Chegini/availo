import { ServiceUnavailableException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { HealthController } from './health.controller';
import type { HealthCheckResponse, HealthService } from './health.service';

describe('HealthController', () => {
  it('returns the health response when dependencies are healthy', () => {
    const health = createHealthResponse('ok');
    const controller = new HealthController(createHealthService(health));

    expect(controller.check()).toBe(health);
  });

  it('throws a 503 when any dependency is unhealthy', () => {
    const health = createHealthResponse('error');
    const controller = new HealthController(createHealthService(health));

    expect(() => controller.check()).toThrow(ServiceUnavailableException);
  });
});

function createHealthService(response: HealthCheckResponse): HealthService {
  return {
    check: () => response,
  } as HealthService;
}

function createHealthResponse(
  status: HealthCheckResponse['status'],
): HealthCheckResponse {
  return {
    service: 'call-requests-service',
    status,
    timestamp: '2026-06-22T00:00:00.000Z',
    checks: {
      mongodb: {
        status: status === 'ok' ? 'up' : 'down',
        readyState: status === 'ok' ? 1 : 0,
        readyStateName: status === 'ok' ? 'connected' : 'disconnected',
      },
      rabbitmq: {
        status: 'up',
      },
    },
  };
}
