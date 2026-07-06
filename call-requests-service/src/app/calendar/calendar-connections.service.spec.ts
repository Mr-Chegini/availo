import { BadRequestException, NotImplementedException } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CalendarConnectionsService } from './calendar-connections.service';

describe('CalendarConnectionsService', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('lists active calendar connections without token fields', async () => {
    const calendarAccountsService = {
      findActiveByOwner: vi.fn().mockResolvedValue([
        {
          id: 'account-1',
          provider: 'google',
          providerAccountId: 'google-account-1',
          primaryCalendarId: 'primary',
          isActive: true,
          accessToken: 'access-token',
          refreshToken: 'refresh-token',
          createdAt: new Date('2030-01-01T00:00:00.000Z'),
          updatedAt: new Date('2030-01-01T00:30:00.000Z'),
        },
      ]),
    };
    const service = new CalendarConnectionsService(
      calendarAccountsService as unknown as never,
      {
        createAuthorizationUrl: vi.fn(),
      } as unknown as never,
    );

    await expect(service.listConnections('owner-1')).resolves.toEqual([
      {
        id: 'account-1',
        provider: 'google',
        providerAccountId: 'google-account-1',
        primaryCalendarId: 'primary',
        isActive: true,
        createdAt: '2030-01-01T00:00:00.000Z',
        updatedAt: '2030-01-01T00:30:00.000Z',
      },
    ]);
    expect(calendarAccountsService.findActiveByOwner).toHaveBeenCalledWith(
      'owner-1',
    );
  });

  it('starts Google connection by returning an authorization URL', () => {
    const service = new CalendarConnectionsService(
      {
        findActiveByOwner: vi.fn(),
      } as unknown as never,
      {
        createAuthorizationUrl: vi
          .fn()
          .mockReturnValue('https://accounts.google.com/oauth'),
      } as unknown as never,
    );

    expect(service.startGoogleConnection('owner-1')).toEqual({
      authorizationUrl: 'https://accounts.google.com/oauth',
    });
  });

  it('returns an explicit not implemented error before Google OAuth is configured', () => {
    const service = new CalendarConnectionsService(
      {
        findActiveByOwner: vi.fn(),
      } as unknown as never,
      {
        createAuthorizationUrl: vi.fn(() => {
          throw new NotImplementedException(
            'Google Calendar OAuth is not configured yet',
          );
        }),
      } as unknown as never,
    );

    expect(() => service.startGoogleConnection('owner-1')).toThrow(
      NotImplementedException,
    );
  });

  it('handles Google callback by exchanging the code and storing the connected account', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2030-01-01T00:00:00.000Z'));
    const calendarAccountsService = {
      findActiveByOwner: vi.fn(),
      upsertConnectedAccount: vi.fn().mockResolvedValue({ id: 'account-1' }),
    };
    const googleCalendarOAuthService = {
      createAuthorizationUrl: vi.fn(),
      verifyState: vi.fn().mockReturnValue({
        ownerId: 'owner-1',
        issuedAt: '2030-01-01T00:00:00.000Z',
      }),
      exchangeAuthorizationCode: vi.fn().mockResolvedValue({
        accessToken: 'google-access-token',
        refreshToken: 'google-refresh-token',
        expiresIn: 3600,
        tokenType: 'Bearer',
      }),
      getPrimaryCalendarIdentity: vi.fn().mockResolvedValue({
        providerAccountId: 'owner-1@gmail.com',
        primaryCalendarId: 'owner-1@gmail.com',
      }),
    };
    const service = new CalendarConnectionsService(
      calendarAccountsService as unknown as never,
      googleCalendarOAuthService as unknown as never,
    );

    await expect(
      service.handleGoogleCallback('authorization-code', 'signed-state'),
    ).resolves.toEqual({
      ownerId: 'owner-1',
      provider: 'google',
      providerAccountId: 'owner-1@gmail.com',
      primaryCalendarId: 'owner-1@gmail.com',
      message: 'Google Calendar connected',
    });
    expect(googleCalendarOAuthService.verifyState).toHaveBeenCalledWith(
      'signed-state',
    );
    expect(
      googleCalendarOAuthService.exchangeAuthorizationCode,
    ).toHaveBeenCalledWith('authorization-code');
    expect(
      googleCalendarOAuthService.getPrimaryCalendarIdentity,
    ).toHaveBeenCalledWith('google-access-token');
    expect(calendarAccountsService.upsertConnectedAccount).toHaveBeenCalledWith(
      {
        ownerId: 'owner-1',
        provider: 'google',
        providerAccountId: 'owner-1@gmail.com',
        primaryCalendarId: 'owner-1@gmail.com',
        accessToken: 'google-access-token',
        refreshToken: 'google-refresh-token',
        tokenExpiresAt: new Date('2030-01-01T01:00:00.000Z'),
      },
    );
  });

  it('rejects a Google callback without code or state', async () => {
    const service = new CalendarConnectionsService(
      {
        findActiveByOwner: vi.fn(),
        upsertConnectedAccount: vi.fn(),
      } as unknown as never,
      {
        createAuthorizationUrl: vi.fn(),
        verifyState: vi.fn(),
        exchangeAuthorizationCode: vi.fn(),
        getPrimaryCalendarIdentity: vi.fn(),
      } as unknown as never,
    );

    await expect(
      service.handleGoogleCallback(undefined, 'signed-state'),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.handleGoogleCallback('authorization-code', undefined),
    ).rejects.toThrow(BadRequestException);
  });

  it('propagates Google OAuth configuration errors during callback', async () => {
    const service = new CalendarConnectionsService(
      {
        findActiveByOwner: vi.fn(),
        upsertConnectedAccount: vi.fn(),
      } as unknown as never,
      {
        createAuthorizationUrl: vi.fn(),
        verifyState: vi.fn(() => {
          throw new NotImplementedException(
            'Google Calendar OAuth is not configured yet',
          );
        }),
        exchangeAuthorizationCode: vi.fn(),
        getPrimaryCalendarIdentity: vi.fn(),
      } as unknown as never,
    );

    await expect(
      service.handleGoogleCallback('authorization-code', 'signed-state'),
    ).rejects.toThrow(NotImplementedException);
  });

  it('does not exchange tokens when Google callback state is invalid or tampered', async () => {
    const googleCalendarOAuthService = {
      createAuthorizationUrl: vi.fn(),
      verifyState: vi.fn(() => {
        throw new Error('Invalid Google Calendar OAuth state');
      }),
      exchangeAuthorizationCode: vi.fn(),
      getPrimaryCalendarIdentity: vi.fn(),
    };
    const calendarAccountsService = {
      findActiveByOwner: vi.fn(),
      upsertConnectedAccount: vi.fn(),
    };
    const service = new CalendarConnectionsService(
      calendarAccountsService as unknown as never,
      googleCalendarOAuthService as unknown as never,
    );

    await expect(
      service.handleGoogleCallback('authorization-code', 'tampered-state'),
    ).rejects.toThrow(BadRequestException);
    expect(
      googleCalendarOAuthService.exchangeAuthorizationCode,
    ).not.toHaveBeenCalled();
    expect(
      calendarAccountsService.upsertConnectedAccount,
    ).not.toHaveBeenCalled();
  });

  it('does not persist a connection when token exchange fails', async () => {
    const calendarAccountsService = {
      findActiveByOwner: vi.fn(),
      upsertConnectedAccount: vi.fn(),
    };
    const service = new CalendarConnectionsService(
      calendarAccountsService as unknown as never,
      {
        createAuthorizationUrl: vi.fn(),
        verifyState: vi.fn().mockReturnValue({
          ownerId: 'owner-1',
          issuedAt: '2030-01-01T00:00:00.000Z',
        }),
        exchangeAuthorizationCode: vi.fn().mockRejectedValue(new Error('boom')),
        getPrimaryCalendarIdentity: vi.fn(),
      } as unknown as never,
    );

    await expect(
      service.handleGoogleCallback('authorization-code', 'signed-state'),
    ).rejects.toThrow('boom');
    expect(
      calendarAccountsService.upsertConnectedAccount,
    ).not.toHaveBeenCalled();
  });

  it('does not persist a connection when primary calendar lookup fails', async () => {
    const calendarAccountsService = {
      findActiveByOwner: vi.fn(),
      upsertConnectedAccount: vi.fn(),
    };
    const service = new CalendarConnectionsService(
      calendarAccountsService as unknown as never,
      {
        createAuthorizationUrl: vi.fn(),
        verifyState: vi.fn().mockReturnValue({
          ownerId: 'owner-1',
          issuedAt: '2030-01-01T00:00:00.000Z',
        }),
        exchangeAuthorizationCode: vi.fn().mockResolvedValue({
          accessToken: 'google-access-token',
          refreshToken: 'google-refresh-token',
          expiresIn: 3600,
          tokenType: 'Bearer',
        }),
        getPrimaryCalendarIdentity: vi
          .fn()
          .mockRejectedValue(new Error('calendar lookup failed')),
      } as unknown as never,
    );

    await expect(
      service.handleGoogleCallback('authorization-code', 'signed-state'),
    ).rejects.toThrow('calendar lookup failed');
    expect(
      calendarAccountsService.upsertConnectedAccount,
    ).not.toHaveBeenCalled();
  });

  it('persists owner id from signed state rather than request-controlled fields', async () => {
    const calendarAccountsService = {
      findActiveByOwner: vi.fn(),
      upsertConnectedAccount: vi.fn().mockResolvedValue({ id: 'account-1' }),
    };
    const service = new CalendarConnectionsService(
      calendarAccountsService as unknown as never,
      {
        createAuthorizationUrl: vi.fn(),
        verifyState: vi.fn().mockReturnValue({
          ownerId: 'signed-owner',
          issuedAt: '2030-01-01T00:00:00.000Z',
        }),
        exchangeAuthorizationCode: vi.fn().mockResolvedValue({
          accessToken: 'google-access-token',
          expiresIn: 3600,
          tokenType: 'Bearer',
        }),
        getPrimaryCalendarIdentity: vi.fn().mockResolvedValue({
          providerAccountId: 'signed-owner@gmail.com',
          primaryCalendarId: 'signed-owner@gmail.com',
        }),
      } as unknown as never,
    );

    await service.handleGoogleCallback('authorization-code', 'signed-state');

    expect(calendarAccountsService.upsertConnectedAccount).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerId: 'signed-owner',
      }),
    );
  });

  it('keeps callback validation backward-compatible for invalid state', async () => {
    const service = new CalendarConnectionsService(
      {
        findActiveByOwner: vi.fn(),
        upsertConnectedAccount: vi.fn(),
      } as unknown as never,
      {
        createAuthorizationUrl: vi.fn(),
        verifyState: vi.fn(() => {
          throw new Error('Invalid Google Calendar OAuth state');
        }),
        exchangeAuthorizationCode: vi.fn(),
        getPrimaryCalendarIdentity: vi.fn(),
      } as unknown as never,
    );

    await expect(
      service.handleGoogleCallback('authorization-code', 'tampered-state'),
    ).rejects.toThrow(BadRequestException);
  });

  it('keeps callback validation backward-compatible for valid state by returning connection context', async () => {
    const service = new CalendarConnectionsService(
      {
        findActiveByOwner: vi.fn(),
        upsertConnectedAccount: vi.fn().mockResolvedValue({ id: 'account-1' }),
      } as unknown as never,
      {
        createAuthorizationUrl: vi.fn(),
        verifyState: vi.fn().mockReturnValue({
          ownerId: 'owner-1',
          issuedAt: '2030-01-01T00:00:00.000Z',
        }),
        exchangeAuthorizationCode: vi.fn().mockResolvedValue({
          accessToken: 'google-access-token',
          expiresIn: 3600,
          tokenType: 'Bearer',
        }),
        getPrimaryCalendarIdentity: vi.fn().mockResolvedValue({
          providerAccountId: 'owner-1@gmail.com',
          primaryCalendarId: 'owner-1@gmail.com',
        }),
      } as unknown as never,
    );

    await expect(
      service.handleGoogleCallback('authorization-code', 'signed-state'),
    ).resolves.toMatchObject({
      ownerId: 'owner-1',
      message: 'Google Calendar connected',
    });
  });
});
