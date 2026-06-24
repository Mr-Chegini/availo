import { Injectable } from '@nestjs/common';
import type {
  CalendarBusySlot,
  CalendarProvider,
  CancelCalendarEventInput,
  CreateCalendarEventInput,
  CreateCalendarEventResult,
  GetBusySlotsInput,
  UpdateCalendarEventInput,
} from './calendar-provider';

@Injectable()
export class LocalCalendarProvider implements CalendarProvider {
  async getBusySlots(input: GetBusySlotsInput): Promise<CalendarBusySlot[]> {
    void input;

    return [];
  }

  async createEvent(
    input: CreateCalendarEventInput,
  ): Promise<CreateCalendarEventResult> {
    void input;

    return {};
  }

  async updateEvent(input: UpdateCalendarEventInput): Promise<void> {
    void input;

    return;
  }

  async cancelEvent(input: CancelCalendarEventInput): Promise<void> {
    void input;

    return;
  }
}
