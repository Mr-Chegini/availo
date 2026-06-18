import { BadRequestException, NotImplementedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { CalendarConnectionsService } from './calendar-connections.service';

describe('CalendarConnectionsService', () => {
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

  it('handles Google callback with a valid signed state', () => {
    const service = new CalendarConnectionsService(
      {
        findActiveByOwner: vi.fn(),
      } as unknown as never,
      {
        createAuthorizationUrl: vi.fn(),
        verifyState: vi.fn().mockReturnValue({
          ownerId: 'owner-1',
          issuedAt: '2030-01-01T00:00:00.000Z',
        }),
      } as unknown as never,
    );

    expect(
      service.handleGoogleCallback('authorization-code', 'signed-state'),
    ).toEqual({
      ownerId: 'owner-1',
      message: 'Google Calendar OAuth callback verified',
    });
  });

  it('rejects a Google callback with invalid or tampered state', () => {
    const service = new CalendarConnectionsService(
      {
        findActiveByOwner: vi.fn(),
      } as unknown as never,
      {
        createAuthorizationUrl: vi.fn(),
        verifyState: vi.fn(() => {
          throw new Error('Invalid Google Calendar OAuth state');
        }),
      } as unknown as never,
    );

    expect(() =>
      service.handleGoogleCallback('authorization-code', 'tampered-state'),
    ).toThrow(BadRequestException);
  });
});
