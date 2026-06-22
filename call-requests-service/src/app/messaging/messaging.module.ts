import { Module } from '@nestjs/common';
import { MetricsModule } from '../metrics/metrics.module';
import { RabbitmqPublisherService } from './rabbitmq-publisher.service';

@Module({
  imports: [MetricsModule],
  providers: [RabbitmqPublisherService],
  exports: [RabbitmqPublisherService],
})
export class MessagingModule {}
