import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { HealthService } from './health.service';
import type { HealthCheckResponse } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  check(): HealthCheckResponse {
    const health = this.healthService.check();

    if (health.status !== 'ok') {
      throw new ServiceUnavailableException(health);
    }

    return health;
  }
}
