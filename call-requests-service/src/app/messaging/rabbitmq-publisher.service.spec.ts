import type { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';
import type { MetricsService } from '../metrics/metrics.service';
import { RabbitmqPublisherService } from './rabbitmq-publisher.service';

describe('RabbitmqPublisherService metrics', () => {
  it('increments publish failure metrics when the channel is not initialized', async () => {
    const metricsService = {
      increment: vi.fn(),
    };
    const service = new RabbitmqPublisherService(
      {} as ConfigService,
      metricsService as unknown as MetricsService,
    );

    await expect(service.publish('call.requested', {})).rejects.toThrow(
      'RabbitMQ channel is not initialized',
    );

    expect(metricsService.increment).toHaveBeenCalledWith(
      'rabbitmq.publish_failed',
    );
  });
});
