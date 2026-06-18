import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CALENDAR_PROVIDER } from './calendar-provider';
import { LocalCalendarProvider } from './local-calendar-provider.service';
import {
  CalendarAccount,
  CalendarAccountSchema,
} from './calendar-account.schema';

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
    LocalCalendarProvider,
    {
      provide: CALENDAR_PROVIDER,
      useExisting: LocalCalendarProvider,
    },
  ],
  exports: [CALENDAR_PROVIDER],
})
export class CalendarModule {}
