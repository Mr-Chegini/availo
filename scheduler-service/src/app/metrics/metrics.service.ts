import { Injectable } from '@nestjs/common';

export type SchedulerMetricCounterName =
  | 'scheduler.reminder_publish_success'
  | 'scheduler.reminder_publish_failure'
  | 'scheduler.daily_digest_publish_success'
  | 'scheduler.daily_digest_publish_failure';

export type SchedulerMetricsSnapshot = {
  service: 'scheduler-service';
  counters: Record<SchedulerMetricCounterName, number>;
};

const COUNTER_NAMES: SchedulerMetricCounterName[] = [
  'scheduler.reminder_publish_success',
  'scheduler.reminder_publish_failure',
  'scheduler.daily_digest_publish_success',
  'scheduler.daily_digest_publish_failure',
];

@Injectable()
export class SchedulerMetricsService {
  private readonly counters = new Map<SchedulerMetricCounterName, number>(
    COUNTER_NAMES.map((counterName) => [counterName, 0]),
  );

  increment(counterName: SchedulerMetricCounterName): void {
    this.counters.set(counterName, this.getCounterValue(counterName) + 1);
  }

  snapshot(): SchedulerMetricsSnapshot {
    return {
      service: 'scheduler-service',
      counters: Object.fromEntries(
        COUNTER_NAMES.map((counterName) => [
          counterName,
          this.getCounterValue(counterName),
        ]),
      ) as Record<SchedulerMetricCounterName, number>,
    };
  }

  private getCounterValue(counterName: SchedulerMetricCounterName): number {
    return this.counters.get(counterName) ?? 0;
  }
}
