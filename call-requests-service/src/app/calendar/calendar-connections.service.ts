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
  provider: 'google';
  providerAccountId: string;
  primaryCalendarId: string;
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

  async handleGoogleCallback(
    code: string | undefined,
    state: string | undefined,
  ): Promise<GoogleCalendarCallbackResponseDto> {
    if (!code) {
      throw new BadRequestException('Google Calendar OAuth code is required');
    }

    if (!state) {
      throw new BadRequestException('Google Calendar OAuth state is required');
    }

    const payload = this.verifyGoogleCallbackState(state);
    const tokenResponse =
      await this.googleCalendarOAuthService.exchangeAuthorizationCode(code);
    const calendarIdentity =
      await this.googleCalendarOAuthService.getPrimaryCalendarIdentity(
        tokenResponse.accessToken,
      );

    await this.calendarAccountsService.upsertConnectedAccount({
      ownerId: payload.ownerId,
      provider: 'google',
      providerAccountId: calendarIdentity.providerAccountId,
      primaryCalendarId: calendarIdentity.primaryCalendarId,
      accessToken: tokenResponse.accessToken,
      refreshToken: tokenResponse.refreshToken,
      tokenExpiresAt: new Date(Date.now() + tokenResponse.expiresIn * 1000),
    });

    return {
      ownerId: payload.ownerId,
      provider: 'google',
      providerAccountId: calendarIdentity.providerAccountId,
      primaryCalendarId: calendarIdentity.primaryCalendarId,
      message: 'Google Calendar connected',
    };
  }

  private verifyGoogleCallbackState(state: string) {
    try {
      return this.googleCalendarOAuthService.verifyState(state);
    } catch (error) {
      if (error instanceof NotImplementedException) {
        throw error;
      }

      throw new BadRequestException('Invalid Google Calendar OAuth state');
    }
  }
}
