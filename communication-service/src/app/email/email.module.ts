import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { EmailConsumerService } from './email-consumer.service';
import { emailSenderProvider } from './email-sender.provider';
import {
  ProcessedEmailEvent,
  ProcessedEmailEventSchema,
} from './processed-email-event.schema';
import { ProcessedEmailEventsService } from './processed-email-events.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: ProcessedEmailEvent.name,
        schema: ProcessedEmailEventSchema,
      },
    ]),
  ],
  providers: [
    EmailConsumerService,
    emailSenderProvider,
    ProcessedEmailEventsService,
  ],
})
export class EmailModule {}
