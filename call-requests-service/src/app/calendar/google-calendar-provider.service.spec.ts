import { describe, expect, it, vi } from 'vitest';
import { GoogleCalendarProvider } from './google-calendar-provider.service';

describe('GoogleCalendarProvider', () => {
  it('restores the active Google access token before reading busy slots', async () => {
    const calendarAccountsService = {
      findActiveByOwner: vi.fn().mockResolvedValue([
        {
          provider: 'local',
          accessToken: 'protected-local-access-token',
        },
        {
          provider: 'google',
          accessToken: 'protected-google-access-token',
        },
      ]),
    };
    const calendarTokenProtector = {
      restore: vi.fn().mockReturnValue('google-access-token'),
    };
    const provider = new GoogleCalendarProvider(
      calendarAccountsService as unknown as never,
      calendarTokenProtector as unknown as never,
    );

    await expect(
      provider.getBusySlots({
        from: '2026-05-15T07:00:00.000Z',
        to: '2026-05-15T15:00:00.000Z',
      }),
    ).resolves.toEqual([]);
    expect(calendarAccountsService.findActiveByOwner).toHaveBeenCalledWith(
      'default-admin',
    );
    expect(calendarTokenProtector.restore).toHaveBeenCalledWith(
      'protected-google-access-token',
    );
  });

  it('does not restore a token when no active Google account is connected', async () => {
    const calendarAccountsService = {
      findActiveByOwner: vi.fn().mockResolvedValue([
        {
          provider: 'local',
          accessToken: 'protected-local-access-token',
        },
      ]),
    };
    const calendarTokenProtector = {
      restore: vi.fn(),
    };
    const provider = new GoogleCalendarProvider(
      calendarAccountsService as unknown as never,
      calendarTokenProtector as unknown as never,
    );

    await expect(
      provider.getBusySlots({
        from: '2026-05-15T07:00:00.000Z',
        to: '2026-05-15T15:00:00.000Z',
      }),
    ).resolves.toEqual([]);
    expect(calendarTokenProtector.restore).not.toHaveBeenCalled();
  });

  it('accepts event creation while Google event creation is not implemented yet', async () => {
    const provider = new GoogleCalendarProvider(
      {
        findActiveByOwner: vi.fn().mockResolvedValue([]),
      } as unknown as never,
      {
        restore: vi.fn(),
      } as unknown as never,
    );

    await expect(
      provider.createEvent({
        title: 'Call with user@example.com',
        startsAt: '2026-05-15T07:00:00.000Z',
        endsAt: '2026-05-15T07:30:00.000Z',
        attendeeEmail: 'user@example.com',
        attendeePhoneNumber: '+90 555 111 22 33',
      }),
    ).resolves.toEqual({});
  });
});
