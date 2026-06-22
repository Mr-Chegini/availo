import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CallRequest, CallRequestSchema } from './call-request.schema';
import { CallRequestsController } from './call-requests.controller';
import { CallRequestsService } from './call-requests.service';
import { PublicBookingAvailabilityController } from './public-booking-availability.controller';
import { MessagingModule } from '../messaging/messaging.module';
import { CalendarModule } from '../calendar/calendar.module';
import { HostsModule } from '../hosts/hosts.module';
import { AuthModule } from '../auth/auth.module';
import { RateLimitModule } from '../rate-limit/rate-limit.module';
import { MetricsModule } from '../metrics/metrics.module';

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
    AuthModule,
    RateLimitModule,
    MetricsModule,
  ],
  controllers: [CallRequestsController, PublicBookingAvailabilityController],
  providers: [CallRequestsService],
  exports: [CallRequestsService],
})
export class CallRequestsModule {}
