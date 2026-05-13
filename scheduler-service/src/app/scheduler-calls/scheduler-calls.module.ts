import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SchedulerCall, SchedulerCallSchema } from './scheduler-call.schema';
import { SchedulerCallsService } from './scheduler-calls.service';
import { SchedulerEventsConsumerService } from './scheduler-events-consumer.service';
import { MessagingModule } from '../messaging/messaging.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: SchedulerCall.name,
        schema: SchedulerCallSchema,
      },
    ]),
    MessagingModule,
  ],
  providers: [SchedulerCallsService, SchedulerEventsConsumerService],
})
export class SchedulerCallsModule {}
