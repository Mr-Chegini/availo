import { Module } from '@nestjs/common';
import { EmailConsumerService } from './email-consumer.service';

@Module({
  providers: [EmailConsumerService],
})
export class EmailModule {}