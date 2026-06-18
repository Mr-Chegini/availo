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
import { GoogleCalendarOAuthService } from './google-calendar-oauth.service';

@Module({
  imports: [
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
    GoogleCalendarOAuthService,
    LocalCalendarProvider,
    {
      provide: CALENDAR_PROVIDER,
      useExisting: LocalCalendarProvider,
    },
  ],
  controllers: [CalendarConnectionsController],
  exports: [CALENDAR_PROVIDER, CalendarAccountsService],
})
export class CalendarModule {}
