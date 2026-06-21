import { Injectable } from '@nestjs/common';
import axios from 'axios';
import type {
  CalendarBusySlot,
  CalendarProvider,
  CancelCalendarEventInput,
  CreateCalendarEventInput,
  CreateCalendarEventResult,
  GetBusySlotsInput,
  UpdateCalendarEventInput,
} from './calendar-provider';
import { CalendarAccountsService } from './calendar-accounts.service';
import { CalendarTokenProtector } from './calendar-token-protector.service';

const DEFAULT_OWNER_ID = 'default-admin';
const GOOGLE_FREE_BUSY_URL = 'https://www.googleapis.com/calendar/v3/freeBusy';
const GOOGLE_CALENDAR_API_BASE_URL =
  'https://www.googleapis.com/calendar/v3/calendars';

interface GoogleCalendarConnection {
  accessToken: string;
  primaryCalendarId: string;
}

interface GoogleFreeBusyResponse {
  calendars: Record<
    string,
    {
      busy: Array<{
        start: string;
        end: string;
      }>;
    }
  >;
}

interface GoogleCreateEventResponse {
  id?: string;
}

interface GoogleCalendarEventInput {
  summary: string;
  start: {
    dateTime: string;
  };
  end: {
    dateTime: string;
  };
  attendees: Array<{
    email: string;
  }>;
  description: string;
  location?: string;
}

@Injectable()
export class GoogleCalendarProvider implements CalendarProvider {
  constructor(
    private readonly calendarAccountsService: CalendarAccountsService,
    private readonly calendarTokenProtector: CalendarTokenProtector,
  ) {}

  async getBusySlots(input: GetBusySlotsInput): Promise<CalendarBusySlot[]> {
    const connection = await this.getConnectionForDefaultOwner();

    if (!connection) {
      return [];
    }

    const response = await axios.post<GoogleFreeBusyResponse>(
      GOOGLE_FREE_BUSY_URL,
      {
        timeMin: input.from,
        timeMax: input.to,
        items: [
          {
            id: connection.primaryCalendarId,
          },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${connection.accessToken}`,
        },
      },
    );

    return (
      response.data.calendars[connection.primaryCalendarId]?.busy.map(
        (busySlot) => ({
          startsAt: busySlot.start,
          endsAt: busySlot.end,
          source: 'google',
        }),
      ) ?? []
    );
  }

  async createEvent(
    input: CreateCalendarEventInput,
  ): Promise<CreateCalendarEventResult> {
    const connection = await this.getConnectionForDefaultOwner();

    if (!connection) {
      return {};
    }

    const response = await axios.post<GoogleCreateEventResponse>(
      `${GOOGLE_CALENDAR_API_BASE_URL}/${encodeURIComponent(
        connection.primaryCalendarId,
      )}/events`,
      toGoogleCalendarEventInput(input),
      {
        headers: {
          Authorization: `Bearer ${connection.accessToken}`,
        },
      },
    );

    return {
      providerEventId: response.data.id,
    };
  }

  async updateEvent(input: UpdateCalendarEventInput): Promise<void> {
    const connection = await this.getConnectionForDefaultOwner();

    if (!connection) {
      return;
    }

    await axios.patch(
      `${GOOGLE_CALENDAR_API_BASE_URL}/${encodeURIComponent(
        connection.primaryCalendarId,
      )}/events/${encodeURIComponent(input.providerEventId)}`,
      toGoogleCalendarEventInput(input),
      {
        headers: {
          Authorization: `Bearer ${connection.accessToken}`,
        },
      },
    );
  }

  async cancelEvent(input: CancelCalendarEventInput): Promise<void> {
    const connection = await this.getConnectionForDefaultOwner();

    if (!connection) {
      return;
    }

    await axios.delete(
      `${GOOGLE_CALENDAR_API_BASE_URL}/${encodeURIComponent(
        connection.primaryCalendarId,
      )}/events/${encodeURIComponent(input.providerEventId)}`,
      {
        headers: {
          Authorization: `Bearer ${connection.accessToken}`,
        },
      },
    );
  }

  private async getConnectionForDefaultOwner(): Promise<
    GoogleCalendarConnection | undefined
  > {
    const accounts =
      await this.calendarAccountsService.findActiveByOwner(DEFAULT_OWNER_ID);
    const googleAccount = accounts.find(
      (account) => account.provider === 'google' && account.accessToken,
    );

    if (!googleAccount?.accessToken) {
      return undefined;
    }

    return {
      accessToken: this.calendarTokenProtector.restore(
        googleAccount.accessToken,
      ),
      primaryCalendarId: googleAccount.primaryCalendarId,
    };
  }
}

function toGoogleCalendarEventInput(
  input: CreateCalendarEventInput,
): GoogleCalendarEventInput {
  const eventInput: GoogleCalendarEventInput = {
    summary: input.title,
    start: {
      dateTime: input.startsAt,
    },
    end: {
      dateTime: input.endsAt,
    },
    attendees: [
      {
        email: input.attendeeEmail,
      },
    ],
    description: `Phone number: ${input.attendeePhoneNumber}`,
  };

  if (input.location) {
    eventInput.location = input.location;
  }

  return eventInput;
}
