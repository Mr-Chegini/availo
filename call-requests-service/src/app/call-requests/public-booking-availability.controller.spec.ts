import { GUARDS_METADATA } from '@nestjs/common/constants';
import { describe, expect, it, vi } from 'vitest';
import type { EventTypesService } from '../hosts/event-types.service';
import type { HostAccountsService } from '../hosts/host-accounts.service';
import type { CallRequestsService } from './call-requests.service';
import { PublicBookingAvailabilityController } from './public-booking-availability.controller';

describe('PublicBookingAvailabilityController', () => {
  it('keeps the public booking availability endpoint unauthenticated', () => {
    const guards =
      Reflect.getMetadata(
        GUARDS_METADATA,
        PublicBookingAvailabilityController.prototype.getAvailability,
      ) ?? [];

    expect(guards).toEqual([]);
  });

  it('looks up availability by host slug, event type slug, and date', async () => {
    const host = {
      _id: 'host-1',
    };
    const eventType = {
      slug: 'intro-call',
    };
    const availability = [
      {
        scheduledAt: '2030-01-01T09:00:00.000Z',
        available: true,
      },
    ];
    const hostAccountsService = {
      getBySlug: vi.fn().mockResolvedValue(host),
    };
    const eventTypesService = {
      getActiveByHostIdAndSlug: vi.fn().mockResolvedValue(eventType),
    };
    const callRequestsService = {
      getAvailabilityForEventType: vi.fn().mockResolvedValue(availability),
    };
    const controller = new PublicBookingAvailabilityController(
      hostAccountsService as unknown as HostAccountsService,
      eventTypesService as unknown as EventTypesService,
      callRequestsService as unknown as CallRequestsService,
    );

    await expect(
      controller.getAvailability('default-admin', 'intro-call', '2030-01-01'),
    ).resolves.toBe(availability);
    expect(hostAccountsService.getBySlug).toHaveBeenCalledWith('default-admin');
    expect(eventTypesService.getActiveByHostIdAndSlug).toHaveBeenCalledWith(
      'host-1',
      'intro-call',
    );
    expect(
      callRequestsService.getAvailabilityForEventType,
    ).toHaveBeenCalledWith('2030-01-01', eventType);
  });

  it('creates a booking by host slug and event type slug', async () => {
    const host = {
      _id: 'host-1',
    };
    const eventType = {
      slug: 'intro-call',
    };
    const dto = {
      email: 'user@example.com',
      phoneNumber: '+90 555 111 22 33',
      scheduledAt: '2030-01-01T09:00:00.000Z',
    };
    const response = {
      id: 'call-1',
      status: 'REQUESTED',
    };
    const hostAccountsService = {
      getBySlug: vi.fn().mockResolvedValue(host),
    };
    const eventTypesService = {
      getActiveByHostIdAndSlug: vi.fn().mockResolvedValue(eventType),
    };
    const callRequestsService = {
      getAvailabilityForEventType: vi.fn(),
      createForEventType: vi.fn().mockResolvedValue(response),
    };
    const controller = new PublicBookingAvailabilityController(
      hostAccountsService as unknown as HostAccountsService,
      eventTypesService as unknown as EventTypesService,
      callRequestsService as unknown as CallRequestsService,
    );

    await expect(
      controller.createBooking('default-admin', 'intro-call', dto),
    ).resolves.toBe(response);
    expect(hostAccountsService.getBySlug).toHaveBeenCalledWith('default-admin');
    expect(eventTypesService.getActiveByHostIdAndSlug).toHaveBeenCalledWith(
      'host-1',
      'intro-call',
    );
    expect(callRequestsService.createForEventType).toHaveBeenCalledWith(
      dto,
      eventType,
    );
  });
});
