import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GoogleCalendarProvider } from './google-calendar-provider.service';
import { MetricsService } from '../metrics/metrics.service';

vi.mock('axios');

describe('GoogleCalendarProvider', () => {
  let metricsService: MetricsService;

  beforeEach(() => {
    vi.clearAllMocks();
    metricsService = new MetricsService();
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
      metricsService,
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
    expect(metricsService.snapshot().counters).toMatchObject({
      'calendar.freebusy_success': 1,
      'calendar.freebusy_failure': 0,
    });
  });

  it('increments free/busy failure metrics when Google free/busy fails', async () => {
    vi.mocked(axios.post).mockRejectedValueOnce(new Error('Google down'));
    const provider = new GoogleCalendarProvider(
      {
        findActiveByOwner: vi.fn().mockResolvedValue([
          {
            provider: 'google',
            accessToken: 'protected-google-access-token',
            primaryCalendarId: 'primary',
          },
        ]),
      } as unknown as never,
      {
        restore: vi.fn().mockReturnValue('google-access-token'),
      } as unknown as never,
      metricsService,
    );

    await expect(
      provider.getBusySlots({
        from: '2026-05-15T07:00:00.000Z',
        to: '2026-05-15T15:00:00.000Z',
      }),
    ).rejects.toThrow('Google down');
    expect(metricsService.snapshot().counters).toMatchObject({
      'calendar.freebusy_success': 0,
      'calendar.freebusy_failure': 1,
    });
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
      metricsService,
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

  it('creates a Google Calendar event', async () => {
    vi.mocked(axios.post).mockResolvedValueOnce({
      data: {
        id: 'google-event-1',
      },
    });
    const provider = new GoogleCalendarProvider(
      {
        findActiveByOwner: vi.fn().mockResolvedValue([
          {
            provider: 'google',
            accessToken: 'protected-google-access-token',
            primaryCalendarId: 'primary',
          },
        ]),
      } as unknown as never,
      {
        restore: vi.fn().mockReturnValue('google-access-token'),
      } as unknown as never,
      metricsService,
    );

    await expect(
      provider.createEvent({
        title: 'Call with user@example.com',
        startsAt: '2026-05-15T07:00:00.000Z',
        endsAt: '2026-05-15T07:30:00.000Z',
        attendeeEmail: 'user@example.com',
        attendeePhoneNumber: '+90 555 111 22 33',
      }),
    ).resolves.toEqual({
      providerEventId: 'google-event-1',
    });
    expect(axios.post).toHaveBeenCalledWith(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events',
      {
        summary: 'Call with user@example.com',
        start: {
          dateTime: '2026-05-15T07:00:00.000Z',
        },
        end: {
          dateTime: '2026-05-15T07:30:00.000Z',
        },
        attendees: [
          {
            email: 'user@example.com',
          },
        ],
        description: 'Phone number: +90 555 111 22 33',
      },
      {
        headers: {
          Authorization: 'Bearer google-access-token',
        },
      },
    );
    expect(metricsService.snapshot().counters).toMatchObject({
      'calendar.event_create_success': 1,
      'calendar.event_create_failure': 0,
    });
  });

  it('increments event create failure metrics when Google event creation fails', async () => {
    vi.mocked(axios.post).mockRejectedValueOnce(new Error('Google down'));
    const provider = new GoogleCalendarProvider(
      {
        findActiveByOwner: vi.fn().mockResolvedValue([
          {
            provider: 'google',
            accessToken: 'protected-google-access-token',
            primaryCalendarId: 'primary',
          },
        ]),
      } as unknown as never,
      {
        restore: vi.fn().mockReturnValue('google-access-token'),
      } as unknown as never,
      metricsService,
    );

    await expect(
      provider.createEvent({
        title: 'Call with user@example.com',
        startsAt: '2026-05-15T07:00:00.000Z',
        endsAt: '2026-05-15T07:30:00.000Z',
        attendeeEmail: 'user@example.com',
        attendeePhoneNumber: '+90 555 111 22 33',
      }),
    ).rejects.toThrow('Google down');
    expect(metricsService.snapshot().counters).toMatchObject({
      'calendar.event_create_success': 0,
      'calendar.event_create_failure': 1,
    });
  });

  it('skips event creation when no active Google account is connected', async () => {
    const provider = new GoogleCalendarProvider(
      {
        findActiveByOwner: vi.fn().mockResolvedValue([]),
      } as unknown as never,
      {
        restore: vi.fn(),
      } as unknown as never,
      metricsService,
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
    expect(axios.post).not.toHaveBeenCalled();
  });

  it('adds a location when creating a Google Calendar event with a meeting location', async () => {
    vi.mocked(axios.post).mockResolvedValueOnce({
      data: {
        id: 'google-event-1',
      },
    });
    const provider = new GoogleCalendarProvider(
      {
        findActiveByOwner: vi.fn().mockResolvedValue([
          {
            provider: 'google',
            accessToken: 'protected-google-access-token',
            primaryCalendarId: 'primary',
          },
        ]),
      } as unknown as never,
      {
        restore: vi.fn().mockReturnValue('google-access-token'),
      } as unknown as never,
      metricsService,
    );

    await provider.createEvent({
      title: 'Call with user@example.com',
      startsAt: '2026-05-15T07:00:00.000Z',
      endsAt: '2026-05-15T07:30:00.000Z',
      attendeeEmail: 'user@example.com',
      attendeePhoneNumber: '+90 555 111 22 33',
      location: 'Google Meet',
    });

    expect(axios.post).toHaveBeenCalledWith(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events',
      expect.objectContaining({
        location: 'Google Meet',
      }),
      expect.any(Object),
    );
  });

  it('updates a Google Calendar event', async () => {
    vi.mocked(axios.patch).mockResolvedValueOnce({});
    const provider = new GoogleCalendarProvider(
      {
        findActiveByOwner: vi.fn().mockResolvedValue([
          {
            provider: 'google',
            accessToken: 'protected-google-access-token',
            primaryCalendarId: 'primary',
          },
        ]),
      } as unknown as never,
      {
        restore: vi.fn().mockReturnValue('google-access-token'),
      } as unknown as never,
      metricsService,
    );

    await expect(
      provider.updateEvent({
        providerEventId: 'google-event-1',
        title: 'Call with user@example.com',
        startsAt: '2026-05-15T08:00:00.000Z',
        endsAt: '2026-05-15T08:30:00.000Z',
        attendeeEmail: 'user@example.com',
        attendeePhoneNumber: '+90 555 111 22 33',
        location: 'Zoom',
      }),
    ).resolves.toBeUndefined();
    expect(axios.patch).toHaveBeenCalledWith(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events/google-event-1',
      {
        summary: 'Call with user@example.com',
        start: {
          dateTime: '2026-05-15T08:00:00.000Z',
        },
        end: {
          dateTime: '2026-05-15T08:30:00.000Z',
        },
        attendees: [
          {
            email: 'user@example.com',
          },
        ],
        description: 'Phone number: +90 555 111 22 33',
        location: 'Zoom',
      },
      {
        headers: {
          Authorization: 'Bearer google-access-token',
        },
      },
    );
    expect(metricsService.snapshot().counters).toMatchObject({
      'calendar.event_update_success': 1,
      'calendar.event_update_failure': 0,
    });
  });

  it('increments event update failure metrics when Google event update fails', async () => {
    vi.mocked(axios.patch).mockRejectedValueOnce(new Error('Google down'));
    const provider = new GoogleCalendarProvider(
      {
        findActiveByOwner: vi.fn().mockResolvedValue([
          {
            provider: 'google',
            accessToken: 'protected-google-access-token',
            primaryCalendarId: 'primary',
          },
        ]),
      } as unknown as never,
      {
        restore: vi.fn().mockReturnValue('google-access-token'),
      } as unknown as never,
      metricsService,
    );

    await expect(
      provider.updateEvent({
        providerEventId: 'google-event-1',
        title: 'Call with user@example.com',
        startsAt: '2026-05-15T08:00:00.000Z',
        endsAt: '2026-05-15T08:30:00.000Z',
        attendeeEmail: 'user@example.com',
        attendeePhoneNumber: '+90 555 111 22 33',
      }),
    ).rejects.toThrow('Google down');
    expect(metricsService.snapshot().counters).toMatchObject({
      'calendar.event_update_success': 0,
      'calendar.event_update_failure': 1,
    });
  });

  it('skips event update when no active Google account is connected', async () => {
    const provider = new GoogleCalendarProvider(
      {
        findActiveByOwner: vi.fn().mockResolvedValue([]),
      } as unknown as never,
      {
        restore: vi.fn(),
      } as unknown as never,
      metricsService,
    );

    await expect(
      provider.updateEvent({
        providerEventId: 'google-event-1',
        title: 'Call with user@example.com',
        startsAt: '2026-05-15T08:00:00.000Z',
        endsAt: '2026-05-15T08:30:00.000Z',
        attendeeEmail: 'user@example.com',
        attendeePhoneNumber: '+90 555 111 22 33',
      }),
    ).resolves.toBeUndefined();
    expect(axios.patch).not.toHaveBeenCalled();
  });

  it('cancels a Google Calendar event', async () => {
    vi.mocked(axios.delete).mockResolvedValueOnce({});
    const provider = new GoogleCalendarProvider(
      {
        findActiveByOwner: vi.fn().mockResolvedValue([
          {
            provider: 'google',
            accessToken: 'protected-google-access-token',
            primaryCalendarId: 'primary',
          },
        ]),
      } as unknown as never,
      {
        restore: vi.fn().mockReturnValue('google-access-token'),
      } as unknown as never,
      metricsService,
    );

    await expect(
      provider.cancelEvent({
        providerEventId: 'google-event-1',
      }),
    ).resolves.toBeUndefined();
    expect(axios.delete).toHaveBeenCalledWith(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events/google-event-1',
      {
        headers: {
          Authorization: 'Bearer google-access-token',
        },
      },
    );
    expect(metricsService.snapshot().counters).toMatchObject({
      'calendar.event_cancel_success': 1,
      'calendar.event_cancel_failure': 0,
    });
  });

  it('increments event cancel failure metrics when Google event cancellation fails', async () => {
    vi.mocked(axios.delete).mockRejectedValueOnce(new Error('Google down'));
    const provider = new GoogleCalendarProvider(
      {
        findActiveByOwner: vi.fn().mockResolvedValue([
          {
            provider: 'google',
            accessToken: 'protected-google-access-token',
            primaryCalendarId: 'primary',
          },
        ]),
      } as unknown as never,
      {
        restore: vi.fn().mockReturnValue('google-access-token'),
      } as unknown as never,
      metricsService,
    );

    await expect(
      provider.cancelEvent({
        providerEventId: 'google-event-1',
      }),
    ).rejects.toThrow('Google down');
    expect(metricsService.snapshot().counters).toMatchObject({
      'calendar.event_cancel_success': 0,
      'calendar.event_cancel_failure': 1,
    });
  });

  it('skips event cancellation when no active Google account is connected', async () => {
    const provider = new GoogleCalendarProvider(
      {
        findActiveByOwner: vi.fn().mockResolvedValue([]),
      } as unknown as never,
      {
        restore: vi.fn(),
      } as unknown as never,
      metricsService,
    );

    await expect(
      provider.cancelEvent({
        providerEventId: 'google-event-1',
      }),
    ).resolves.toBeUndefined();
    expect(axios.delete).not.toHaveBeenCalled();
  });
});
