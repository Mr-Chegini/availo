import {
  BadRequestException,
  Injectable,
  NotImplementedException,
} from '@nestjs/common';
import { CalendarAccountsService } from './calendar-accounts.service';
import type { CalendarProviderName } from './calendar-account.schema';
import { GoogleCalendarOAuthService } from './google-calendar-oauth.service';

export interface CalendarConnectionDto {
  id: string;
  provider: CalendarProviderName;
  providerAccountId: string;
  primaryCalendarId: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface StartCalendarConnectionResponseDto {
  authorizationUrl: string;
}

export interface GoogleCalendarCallbackResponseDto {
  ownerId: string;
  message: string;
}

@Injectable()
export class CalendarConnectionsService {
  constructor(
    private readonly calendarAccountsService: CalendarAccountsService,
    private readonly googleCalendarOAuthService: GoogleCalendarOAuthService,
  ) {}

  async listConnections(ownerId: string): Promise<CalendarConnectionDto[]> {
    const accounts =
      await this.calendarAccountsService.findActiveByOwner(ownerId);

    return accounts.map((account) => ({
      id: account.id,
      provider: account.provider,
      providerAccountId: account.providerAccountId,
      primaryCalendarId: account.primaryCalendarId,
      isActive: account.isActive,
      createdAt: account.createdAt.toISOString(),
      updatedAt: account.updatedAt.toISOString(),
    }));
  }

  startGoogleConnection(ownerId: string): StartCalendarConnectionResponseDto {
    try {
      return {
        authorizationUrl:
          this.googleCalendarOAuthService.createAuthorizationUrl(ownerId),
      };
    } catch (error) {
      if (error instanceof NotImplementedException) {
        throw error;
      }

      throw error;
    }
  }

  handleGoogleCallback(
    code: string | undefined,
    state: string | undefined,
  ): GoogleCalendarCallbackResponseDto {
    if (!code) {
      throw new BadRequestException('Google Calendar OAuth code is required');
    }

    if (!state) {
      throw new BadRequestException('Google Calendar OAuth state is required');
    }

    try {
      const payload = this.googleCalendarOAuthService.verifyState(state);

      return {
        ownerId: payload.ownerId,
        message: 'Google Calendar OAuth callback verified',
      };
    } catch (error) {
      if (error instanceof NotImplementedException) {
        throw error;
      }

      throw new BadRequestException('Invalid Google Calendar OAuth state');
    }
  }
}
