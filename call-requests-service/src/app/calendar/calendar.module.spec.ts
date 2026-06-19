import 'reflect-metadata';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { describe, expect, it } from 'vitest';
import { CALENDAR_PROVIDER } from './calendar-provider';
import { CalendarModule } from './calendar.module';
import { GoogleCalendarProvider } from './google-calendar-provider.service';

describe('CalendarModule', () => {
  it('uses Google Calendar as the active calendar provider', () => {
    const providers = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      CalendarModule,
    );

    expect(providers).toContainEqual({
      provide: CALENDAR_PROVIDER,
      useExisting: GoogleCalendarProvider,
    });
  });
});
