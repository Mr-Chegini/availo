export const CALENDAR_PROVIDER = Symbol('CALENDAR_PROVIDER');

export interface CalendarBusySlot {
  startsAt: string;
  endsAt: string;
  source: string;
}

export interface GetBusySlotsInput {
  from: string;
  to: string;
}

export interface CreateCalendarEventInput {
  title: string;
  startsAt: string;
  endsAt: string;
  attendeeEmail: string;
  attendeePhoneNumber: string;
  location?: string;
}

export interface CreateCalendarEventResult {
  providerEventId?: string;
}

export interface CancelCalendarEventInput {
  providerEventId: string;
}

export interface CalendarProvider {
  getBusySlots(input: GetBusySlotsInput): Promise<CalendarBusySlot[]>;
  createEvent(
    input: CreateCalendarEventInput,
  ): Promise<CreateCalendarEventResult>;
  cancelEvent(input: CancelCalendarEventInput): Promise<void>;
}
