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
import { GoogleCalendarOAuthService } from './google-calendar-oauth.service';
import { MetricsService } from '../metrics/metrics.service';

const DEFAULT_OWNER_ID = 'default-admin';
const GOOGLE_FREE_BUSY_URL = 'https://www.googleapis.com/calendar/v3/freeBusy';
const GOOGLE_CALENDAR_API_BASE_URL =
  'https://www.googleapis.com/calendar/v3/calendars';
const TOKEN_REFRESH_SAFETY_WINDOW_MS = 5 * 60 * 1000;

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
    private readonly googleCalendarOAuthService: GoogleCalendarOAuthService,
    private readonly metricsService: MetricsService,
  ) {}

  async getBusySlots(input: GetBusySlotsInput): Promise<CalendarBusySlot[]> {
    const connection = await this.getConnectionForDefaultOwner();

    if (!connection) {
      return [];
    }

    try {
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

      this.metricsService.increment('calendar.freebusy_success');

      return (
        response.data.calendars[connection.primaryCalendarId]?.busy.map(
          (busySlot) => ({
            startsAt: busySlot.start,
            endsAt: busySlot.end,
            source: 'google',
          }),
        ) ?? []
      );
    } catch (error) {
      this.metricsService.increment('calendar.freebusy_failure');
      throw error;
    }
  }

  async createEvent(
    input: CreateCalendarEventInput,
  ): Promise<CreateCalendarEventResult> {
    const connection = await this.getConnectionForDefaultOwner();

    if (!connection) {
      return {};
    }

    try {
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

      this.metricsService.increment('calendar.event_create_success');

      return {
        providerEventId: response.data.id,
      };
    } catch (error) {
      this.metricsService.increment('calendar.event_create_failure');
      throw error;
    }
  }

  async updateEvent(input: UpdateCalendarEventInput): Promise<void> {
    const connection = await this.getConnectionForDefaultOwner();

    if (!connection) {
      return;
    }

    try {
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
      this.metricsService.increment('calendar.event_update_success');
    } catch (error) {
      this.metricsService.increment('calendar.event_update_failure');
      throw error;
    }
  }

  async cancelEvent(input: CancelCalendarEventInput): Promise<void> {
    const connection = await this.getConnectionForDefaultOwner();

    if (!connection) {
      return;
    }

    try {
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
      this.metricsService.increment('calendar.event_cancel_success');
    } catch (error) {
      this.metricsService.increment('calendar.event_cancel_failure');
      throw error;
    }
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

    const accessToken = this.calendarTokenProtector.restore(
      googleAccount.accessToken,
    );
    const refreshToken = googleAccount.refreshToken
      ? this.calendarTokenProtector.restore(googleAccount.refreshToken)
      : undefined;

    if (
      refreshToken &&
      shouldRefreshAccessToken(googleAccount.tokenExpiresAt)
    ) {
      const refreshedToken =
        await this.googleCalendarOAuthService.refreshAccessToken(refreshToken);
      const refreshedAccessTokenExpiresAt = new Date(
        Date.now() + refreshedToken.expiresIn * 1000,
      );
      const persistedRefreshToken = refreshedToken.refreshToken ?? refreshToken;

      await this.calendarAccountsService.updateTokens({
        accountId: googleAccount.id,
        accessToken: refreshedToken.accessToken,
        refreshToken: persistedRefreshToken,
        tokenExpiresAt: refreshedAccessTokenExpiresAt,
      });

      return {
        accessToken: refreshedToken.accessToken,
        primaryCalendarId: googleAccount.primaryCalendarId,
      };
    }

    return {
      accessToken,
      primaryCalendarId: googleAccount.primaryCalendarId,
    };
  }
}

function shouldRefreshAccessToken(tokenExpiresAt: Date | undefined): boolean {
  if (!tokenExpiresAt) {
    return false;
  }

  return (
    tokenExpiresAt.getTime() <= Date.now() + TOKEN_REFRESH_SAFETY_WINDOW_MS
  );
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
