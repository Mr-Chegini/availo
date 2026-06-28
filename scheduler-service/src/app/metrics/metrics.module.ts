import { Module } from '@nestjs/common';
import { SchedulerMetricsService } from './metrics.service';

@Module({
  providers: [SchedulerMetricsService],
  exports: [SchedulerMetricsService],
})
export class SchedulerMetricsModule {}
