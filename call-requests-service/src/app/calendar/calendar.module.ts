import { Module } from '@nestjs/common';
import { CALENDAR_PROVIDER } from './calendar-provider';
import { LocalCalendarProvider } from './local-calendar-provider.service';

@Module({
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
