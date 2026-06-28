import { Injectable } from '@nestjs/common';

export type MetricCounterName =
  | 'booking.requested'
  | 'booking.scheduled'
  | 'booking.approved'
  | 'booking.rejected'
  | 'booking.canceled'
  | 'booking.rescheduled'
  | 'calendar.freebusy_success'
  | 'calendar.freebusy_failure'
  | 'calendar.event_create_success'
  | 'calendar.event_create_failure'
  | 'calendar.event_update_success'
  | 'calendar.event_update_failure'
  | 'calendar.event_cancel_success'
  | 'calendar.event_cancel_failure'
  | 'rabbitmq.publish_failed';

export type MetricsSnapshot = {
  service: 'call-requests-service';
  counters: Record<MetricCounterName, number>;
};

const COUNTER_NAMES: MetricCounterName[] = [
  'booking.requested',
  'booking.scheduled',
  'booking.approved',
  'booking.rejected',
  'booking.canceled',
  'booking.rescheduled',
  'calendar.freebusy_success',
  'calendar.freebusy_failure',
  'calendar.event_create_success',
  'calendar.event_create_failure',
  'calendar.event_update_success',
  'calendar.event_update_failure',
  'calendar.event_cancel_success',
  'calendar.event_cancel_failure',
  'rabbitmq.publish_failed',
];

@Injectable()
export class MetricsService {
  private readonly counters = new Map<MetricCounterName, number>(
    COUNTER_NAMES.map((counterName) => [counterName, 0]),
  );

  increment(counterName: MetricCounterName): void {
    this.counters.set(counterName, this.getCounterValue(counterName) + 1);
  }

  snapshot(): MetricsSnapshot {
    return {
      service: 'call-requests-service',
      counters: Object.fromEntries(
        COUNTER_NAMES.map((counterName) => [
          counterName,
          this.getCounterValue(counterName),
        ]),
      ) as Record<MetricCounterName, number>,
    };
  }

  private getCounterValue(counterName: MetricCounterName): number {
    return this.counters.get(counterName) ?? 0;
  }
}
