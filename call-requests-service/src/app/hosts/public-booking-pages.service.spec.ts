import { describe, expect, it, vi } from 'vitest';
import type { EventTypesService } from './event-types.service';
import type { HostAccountsService } from './host-accounts.service';
import { PublicBookingPagesService } from './public-booking-pages.service';

describe('PublicBookingPagesService', () => {
  it('returns public host page data and active event types', async () => {
    const hostAccountsService = {
      getBySlug: vi.fn().mockResolvedValue({
        _id: 'host-1',
        name: 'Default Admin',
        email: 'admin@availo.local',
        slug: 'default-admin',
        timezone: 'Europe/Istanbul',
      }),
    };
    const eventTypesService = {
      findActiveByHostId: vi.fn().mockResolvedValue([
        {
          slug: 'intro-call',
          title: '30 min intro call',
          durationMinutes: 30,
          availabilityTimezone: 'Europe/Istanbul',
          isActive: true,
        },
      ]),
    };
    const service = new PublicBookingPagesService(
      hostAccountsService as unknown as HostAccountsService,
      eventTypesService as unknown as EventTypesService,
    );

    await expect(service.getByHostSlug('default-admin')).resolves.toEqual({
      host: {
        name: 'Default Admin',
        slug: 'default-admin',
        timezone: 'Europe/Istanbul',
      },
      eventTypes: [
        {
          slug: 'intro-call',
          title: '30 min intro call',
          durationMinutes: 30,
          availabilityTimezone: 'Europe/Istanbul',
        },
      ],
    });
    expect(hostAccountsService.getBySlug).toHaveBeenCalledWith('default-admin');
    expect(eventTypesService.findActiveByHostId).toHaveBeenCalledWith('host-1');
  });
});
