import { Injectable } from '@nestjs/common';
import axios from 'axios';
import type {
  CalendarBusySlot,
  CalendarProvider,
  CancelCalendarEventInput,
  CreateCalendarEventInput,
  CreateCalendarEventResult,
  GetBusySlotsInput,
} from './calendar-provider';
import { CalendarAccountsService } from './calendar-accounts.service';
import { CalendarTokenProtector } from './calendar-token-protector.service';

const DEFAULT_OWNER_ID = 'default-admin';
const GOOGLE_FREE_BUSY_URL = 'https://www.googleapis.com/calendar/v3/freeBusy';

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
    _input: CreateCalendarEventInput,
  ): Promise<CreateCalendarEventResult> {
    await this.getConnectionForDefaultOwner();

    return {};
  }

  async cancelEvent(_input: CancelCalendarEventInput): Promise<void> {
    await this.getConnectionForDefaultOwner();
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
