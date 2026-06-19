import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CallRequest, CallRequestSchema } from './call-request.schema';
import { CallRequestsController } from './call-requests.controller';
import { CallRequestsService } from './call-requests.service';
import { MessagingModule } from '../messaging/messaging.module';
import { CalendarModule } from '../calendar/calendar.module';
import { HostsModule } from '../hosts/hosts.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: CallRequest.name,
        schema: CallRequestSchema,
      },
    ]),
    MessagingModule,
    CalendarModule,
    HostsModule,
  ],
  controllers: [CallRequestsController],
  providers: [CallRequestsService],
})
export class CallRequestsModule {}
