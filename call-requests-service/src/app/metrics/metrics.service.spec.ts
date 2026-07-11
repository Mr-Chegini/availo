import { describe, expect, it } from 'vitest';
import { MetricsService } from './metrics.service';

describe('MetricsService', () => {
  it('starts all counters at zero', () => {
    const service = new MetricsService();

    expect(service.snapshot()).toEqual({
      service: 'call-requests-service',
      counters: {
        'booking.requested': 0,
        'booking.scheduled': 0,
        'booking.approved': 0,
        'booking.rejected': 0,
        'booking.canceled': 0,
        'booking.rescheduled': 0,
        'calendar.freebusy_success': 0,
        'calendar.freebusy_failure': 0,
        'calendar.event_create_success': 0,
        'calendar.event_create_failure': 0,
        'calendar.event_update_success': 0,
        'calendar.event_update_failure': 0,
        'calendar.event_cancel_success': 0,
        'calendar.event_cancel_failure': 0,
        'rabbitmq.publish_failed': 0,
      },
    });
  });

  it('increments named counters', () => {
    const service = new MetricsService();

    service.increment('booking.requested');
    service.increment('booking.requested');
    service.increment('rabbitmq.publish_failed');

    expect(service.snapshot().counters).toMatchObject({
      'booking.requested': 2,
      'rabbitmq.publish_failed': 1,
    });
  });
});
