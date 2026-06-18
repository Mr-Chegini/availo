import { NotImplementedException } from '@nestjs/common';
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
});
