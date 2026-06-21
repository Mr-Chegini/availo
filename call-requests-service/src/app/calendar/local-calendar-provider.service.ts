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
  async getBusySlots(_input: GetBusySlotsInput): Promise<CalendarBusySlot[]> {
    return [];
  }

  async createEvent(
    _input: CreateCalendarEventInput,
  ): Promise<CreateCalendarEventResult> {
    return {};
  }

  async updateEvent(_input: UpdateCalendarEventInput): Promise<void> {
    return;
  }

  async cancelEvent(_input: CancelCalendarEventInput): Promise<void> {
    return;
  }
}
