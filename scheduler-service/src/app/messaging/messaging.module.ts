import { Module } from '@nestjs/common';
import { RabbitmqPublisherService } from './rabbitmq-publisher.service';

@Module({
  providers: [RabbitmqPublisherService],
  exports: [RabbitmqPublisherService],
})
export class MessagingModule {}
