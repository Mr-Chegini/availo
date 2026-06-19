import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GoogleCalendarProvider } from './google-calendar-provider.service';

vi.mock('axios');

describe('GoogleCalendarProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reads and maps Google free/busy slots', async () => {
    vi.mocked(axios.post).mockResolvedValueOnce({
      data: {
        calendars: {
          primary: {
            busy: [
              {
                start: '2026-05-15T08:00:00.000Z',
                end: '2026-05-15T08:30:00.000Z',
              },
              {
                start: '2026-05-15T10:00:00.000Z',
                end: '2026-05-15T10:30:00.000Z',
              },
            ],
          },
        },
      },
    });
    const calendarAccountsService = {
      findActiveByOwner: vi.fn().mockResolvedValue([
        {
          provider: 'local',
          accessToken: 'protected-local-access-token',
          primaryCalendarId: 'local-primary',
        },
        {
          provider: 'google',
          accessToken: 'protected-google-access-token',
          primaryCalendarId: 'primary',
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
    ).resolves.toEqual([
      {
        startsAt: '2026-05-15T08:00:00.000Z',
        endsAt: '2026-05-15T08:30:00.000Z',
        source: 'google',
      },
      {
        startsAt: '2026-05-15T10:00:00.000Z',
        endsAt: '2026-05-15T10:30:00.000Z',
        source: 'google',
      },
    ]);
    expect(calendarAccountsService.findActiveByOwner).toHaveBeenCalledWith(
      'default-admin',
    );
    expect(calendarTokenProtector.restore).toHaveBeenCalledWith(
      'protected-google-access-token',
    );
    expect(axios.post).toHaveBeenCalledWith(
      'https://www.googleapis.com/calendar/v3/freeBusy',
      {
        timeMin: '2026-05-15T07:00:00.000Z',
        timeMax: '2026-05-15T15:00:00.000Z',
        items: [
          {
            id: 'primary',
          },
        ],
      },
      {
        headers: {
          Authorization: 'Bearer google-access-token',
        },
      },
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
    expect(axios.post).not.toHaveBeenCalled();
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
