import { Module } from '@nestjs/common';
import { EmailConsumerService } from './email-consumer.service.ts';

@Module({
  providers: [EmailConsumerService],
})
export class EmailModule {}