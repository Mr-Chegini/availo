import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CALENDAR_PROVIDER } from './calendar-provider';
import { LocalCalendarProvider } from './local-calendar-provider.service';
import {
  CalendarAccount,
  CalendarAccountSchema,
} from './calendar-account.schema';
import { CalendarAccountsService } from './calendar-accounts.service';
import { CalendarConnectionsController } from './calendar-connections.controller';
import { CalendarConnectionsService } from './calendar-connections.service';
import { CalendarTokenProtector } from './calendar-token-protector.service';
import { GoogleCalendarProvider } from './google-calendar-provider.service';
import { GoogleCalendarOAuthService } from './google-calendar-oauth.service';
import { AuthModule } from '../auth/auth.module';
import { MetricsModule } from '../metrics/metrics.module';

@Module({
  imports: [
    AuthModule,
    MetricsModule,
    MongooseModule.forFeature([
      {
        name: CalendarAccount.name,
        schema: CalendarAccountSchema,
      },
    ]),
  ],
  providers: [
    CalendarAccountsService,
    CalendarConnectionsService,
    CalendarTokenProtector,
    GoogleCalendarProvider,
    GoogleCalendarOAuthService,
    LocalCalendarProvider,
    {
      provide: CALENDAR_PROVIDER,
      useExisting: GoogleCalendarProvider,
    },
  ],
  controllers: [CalendarConnectionsController],
  exports: [CALENDAR_PROVIDER, CalendarAccountsService],
})
export class CalendarModule {}
