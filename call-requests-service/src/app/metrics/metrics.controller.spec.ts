import { GUARDS_METADATA } from '@nestjs/common/constants';
import { describe, expect, it } from 'vitest';
import { AdminApiKeyGuard } from '../auth/admin-api-key.guard';
import { MetricsController } from './metrics.controller';
import type { MetricsService } from './metrics.service';

describe('MetricsController', () => {
  it('returns the current metrics snapshot', () => {
    const snapshot = {
      service: 'call-requests-service' as const,
      counters: {
        'booking.requested': 1,
        'booking.scheduled': 0,
        'booking.approved': 0,
        'booking.rejected': 0,
        'booking.canceled': 0,
        'booking.rescheduled': 0,
        'rabbitmq.publish_failed': 0,
      },
    };
    const controller = new MetricsController({
      snapshot: () => snapshot,
    } as MetricsService);

    expect(controller.getMetrics()).toBe(snapshot);
  });

  it('protects metrics with the admin API key guard', () => {
    const guards =
      Reflect.getMetadata(
        GUARDS_METADATA,
        MetricsController.prototype.getMetrics,
      ) ?? [];

    expect(guards).toContain(AdminApiKeyGuard);
  });
});
