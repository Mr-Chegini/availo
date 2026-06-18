import { NotImplementedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { describe, expect, it, vi } from 'vitest';
import { GoogleCalendarOAuthService } from './google-calendar-oauth.service';

vi.mock('axios');

describe('GoogleCalendarOAuthService', () => {
  const createConfigService = (overrides: Record<string, string> = {}) =>
    ({
      get: vi.fn((key: string) => {
        const values: Record<string, string> = {
          GOOGLE_CALENDAR_CLIENT_ID: 'google-client-id',
          GOOGLE_CALENDAR_CLIENT_SECRET: 'google-client-secret',
          GOOGLE_CALENDAR_REDIRECT_URI:
            'https://availo.example.com/api/calendar-connections/google/callback',
          GOOGLE_CALENDAR_STATE_SECRET: 'state-secret',
          ...overrides,
        };

        return values[key];
      }),
    }) as unknown as ConfigService;

  it('builds a Google OAuth authorization URL', () => {
    const service = new GoogleCalendarOAuthService(createConfigService());

    const authorizationUrl = new URL(service.createAuthorizationUrl('owner-1'));

    expect(authorizationUrl.origin + authorizationUrl.pathname).toBe(
      'https://accounts.google.com/o/oauth2/v2/auth',
    );
    expect(authorizationUrl.searchParams.get('client_id')).toBe(
      'google-client-id',
    );
    expect(authorizationUrl.searchParams.get('redirect_uri')).toBe(
      'https://availo.example.com/api/calendar-connections/google/callback',
    );
    expect(authorizationUrl.searchParams.get('response_type')).toBe('code');
    expect(authorizationUrl.searchParams.get('access_type')).toBe('offline');
    expect(authorizationUrl.searchParams.get('prompt')).toBe('consent');
    const state = authorizationUrl.searchParams.get('state');
    expect(state).toBeTruthy();
    expect(service.verifyState(state ?? '')).toMatchObject({
      ownerId: 'owner-1',
    });
    expect(authorizationUrl.searchParams.get('scope')).toContain(
      'https://www.googleapis.com/auth/calendar.freebusy',
    );
  });

  it('rejects a tampered OAuth state value', () => {
    const service = new GoogleCalendarOAuthService(createConfigService());
    const state = new URL(
      service.createAuthorizationUrl('owner-1'),
    ).searchParams.get('state');

    expect(() => service.verifyState(`${state}tampered`)).toThrow(
      'Invalid Google Calendar OAuth state',
    );
  });

  it('exchanges an authorization code for Google OAuth tokens', async () => {
    vi.mocked(axios.post).mockResolvedValueOnce({
      data: {
        access_token: 'google-access-token',
        refresh_token: 'google-refresh-token',
        expires_in: 3600,
        token_type: 'Bearer',
        scope: 'https://www.googleapis.com/auth/calendar.freebusy',
      },
    });
    const service = new GoogleCalendarOAuthService(createConfigService());

    await expect(
      service.exchangeAuthorizationCode('authorization-code'),
    ).resolves.toEqual({
      accessToken: 'google-access-token',
      refreshToken: 'google-refresh-token',
      expiresIn: 3600,
      tokenType: 'Bearer',
      scope: 'https://www.googleapis.com/auth/calendar.freebusy',
    });

    expect(axios.post).toHaveBeenCalledWith(
      'https://oauth2.googleapis.com/token',
      expect.any(URLSearchParams),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      },
    );
    const body = vi.mocked(axios.post).mock.calls[0]?.[1] as URLSearchParams;
    expect(body.get('code')).toBe('authorization-code');
    expect(body.get('client_id')).toBe('google-client-id');
    expect(body.get('client_secret')).toBe('google-client-secret');
    expect(body.get('redirect_uri')).toBe(
      'https://availo.example.com/api/calendar-connections/google/callback',
    );
    expect(body.get('grant_type')).toBe('authorization_code');
  });

  it('throws when OAuth config is missing', () => {
    const service = new GoogleCalendarOAuthService({
      get: vi.fn().mockReturnValue(undefined),
    } as unknown as ConfigService);

    expect(() => service.createAuthorizationUrl('owner-1')).toThrow(
      NotImplementedException,
    );
  });
});
