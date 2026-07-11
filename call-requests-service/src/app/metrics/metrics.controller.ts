import { Controller, Get, UseGuards } from '@nestjs/common';
import { AdminSessionGuard } from '../auth/admin-session.guard';
import { MetricsService } from './metrics.service';
import type { MetricsSnapshot } from './metrics.service';

@Controller('metrics')
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @Get()
  @UseGuards(AdminSessionGuard)
  getMetrics(): MetricsSnapshot {
    return this.metricsService.snapshot();
  }
}
