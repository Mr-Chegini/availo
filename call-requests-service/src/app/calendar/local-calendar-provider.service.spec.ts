import { describe, expect, it } from 'vitest';
import { LocalCalendarProvider } from './local-calendar-provider.service';

describe('LocalCalendarProvider', () => {
  it('returns no external busy slots', async () => {
    const provider = new LocalCalendarProvider();

    await expect(
      provider.getBusySlots({
        from: '2026-05-15T07:00:00.000Z',
        to: '2026-05-15T15:00:00.000Z',
      }),
    ).resolves.toEqual([]);
  });

  it('accepts event creation without a provider event id', async () => {
    const provider = new LocalCalendarProvider();

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

  it('accepts event updates as a no-op', async () => {
    const provider = new LocalCalendarProvider();

    await expect(
      provider.updateEvent({
        providerEventId: 'local-event-1',
        title: 'Call with user@example.com',
        startsAt: '2026-05-15T07:00:00.000Z',
        endsAt: '2026-05-15T07:30:00.000Z',
        attendeeEmail: 'user@example.com',
        attendeePhoneNumber: '+90 555 111 22 33',
      }),
    ).resolves.toBeUndefined();
  });
});
