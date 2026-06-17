import { Module } from '@nestjs/common';
import { EmailConsumerService } from './email-consumer.service';
import { emailSenderProvider } from './email-sender.provider';

@Module({
  providers: [EmailConsumerService, emailSenderProvider],
})
export class EmailModule {}
