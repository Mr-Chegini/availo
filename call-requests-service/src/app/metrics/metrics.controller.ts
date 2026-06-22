import { Controller, Get, UseGuards } from '@nestjs/common';
import { AdminApiKeyGuard } from '../auth/admin-api-key.guard';
import { MetricsService } from './metrics.service';
import type { MetricsSnapshot } from './metrics.service';

@Controller('metrics')
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @Get()
  @UseGuards(AdminApiKeyGuard)
  getMetrics(): MetricsSnapshot {
    return this.metricsService.snapshot();
  }
}
