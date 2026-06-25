import { Injectable } from '@nestjs/common';

export type CommunicationMetricCounterName =
  | 'email.send_success'
  | 'email.send_failure'
  | 'email.retry'
  | 'email.dead_letter';

export type CommunicationMetricsSnapshot = {
  service: 'communication-service';
  counters: Record<CommunicationMetricCounterName, number>;
};

const COUNTER_NAMES: CommunicationMetricCounterName[] = [
  'email.send_success',
  'email.send_failure',
  'email.retry',
  'email.dead_letter',
];

@Injectable()
export class CommunicationMetricsService {
  private readonly counters = new Map<CommunicationMetricCounterName, number>(
    COUNTER_NAMES.map((counterName) => [counterName, 0]),
  );

  increment(counterName: CommunicationMetricCounterName): void {
    this.counters.set(counterName, this.getCounterValue(counterName) + 1);
  }

  snapshot(): CommunicationMetricsSnapshot {
    return {
      service: 'communication-service',
      counters: Object.fromEntries(
        COUNTER_NAMES.map((counterName) => [
          counterName,
          this.getCounterValue(counterName),
        ]),
      ) as Record<CommunicationMetricCounterName, number>,
    };
  }

  private getCounterValue(counterName: CommunicationMetricCounterName): number {
    return this.counters.get(counterName) ?? 0;
  }
}
