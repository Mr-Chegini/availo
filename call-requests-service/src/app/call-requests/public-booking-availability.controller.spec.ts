import { GUARDS_METADATA } from '@nestjs/common/constants';
import { describe, expect, it, vi } from 'vitest';
import { AdminApiKeyGuard } from '../auth/admin-api-key.guard';
import type { EventTypesService } from '../hosts/event-types.service';
import type { HostAccountsService } from '../hosts/host-accounts.service';
import { PUBLIC_BOOKING_RATE_LIMIT_METADATA } from '../rate-limit/public-booking-rate-limit.decorator';
import { PublicBookingRateLimitGuard } from '../rate-limit/public-booking-rate-limit.guard';
import type { CallRequestsService } from './call-requests.service';
import { PublicBookingAvailabilityController } from './public-booking-availability.controller';

describe('PublicBookingAvailabilityController', () => {
  it.each([
    ['getAvailability', 'availability'],
    ['createBooking', 'create'],
    ['getBooking', 'manage'],
    ['cancelBooking', 'manage'],
    ['rescheduleBooking', 'manage'],
  ] as const)(
    'keeps %s unauthenticated and rate limited',
    (methodName, expectedRateLimitGroup) => {
      const method = PublicBookingAvailabilityController.prototype[methodName];
      const guards = Reflect.getMetadata(GUARDS_METADATA, method) ?? [];

      expect(guards).toContain(PublicBookingRateLimitGuard);
      expect(guards).not.toContain(AdminApiKeyGuard);
      expect(
        Reflect.getMetadata(PUBLIC_BOOKING_RATE_LIMIT_METADATA, method),
      ).toBe(expectedRateLimitGroup);
    },
  );

  it('looks up availability by host slug, event type slug, and date', async () => {
    const host = {
      _id: 'host-1',
    };
    const eventType = {
      slug: 'intro-call',
      title: '30 min intro call',
      durationMinutes: 30,
      meetingLocation: 'Google Meet',
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
      title: '30 min intro call',
      durationMinutes: 30,
      meetingLocation: 'Google Meet',
    };
    const dto = {
      email: 'user@example.com',
      phoneNumber: '+90 555 111 22 33',
      scheduledAt: '2030-01-01T09:00:00.000Z',
    };
    const response = {
      id: 'call-1',
      email: 'user@example.com',
      phoneNumber: '+90 555 111 22 33',
      scheduledAt: '2030-01-01T09:00:00.000Z',
      status: 'REQUESTED',
      adminNote: 'internal note',
      cancellationToken: 'cancel-token',
      meetingLocation: 'Google Meet',
      createdAt: '2030-01-01T08:00:00.000Z',
      updatedAt: '2030-01-01T08:00:00.000Z',
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
    ).resolves.toEqual({
      bookingId: 'call-1',
      email: 'user@example.com',
      phoneNumber: '+90 555 111 22 33',
      scheduledAt: '2030-01-01T09:00:00.000Z',
      status: 'REQUESTED',
      cancellationToken: 'cancel-token',
      meetingLocation: 'Google Meet',
      eventType: {
        slug: 'intro-call',
        title: '30 min intro call',
        durationMinutes: 30,
        meetingLocation: 'Google Meet',
      },
    });
    expect(hostAccountsService.getBySlug).toHaveBeenCalledWith('default-admin');
    expect(eventTypesService.getActiveByHostIdAndSlug).toHaveBeenCalledWith(
      'host-1',
      'intro-call',
    );
    expect(callRequestsService.createForEventType).toHaveBeenCalledWith(
      dto,
      eventType,
      'default-admin',
    );
  });

  it('cancels a booking by booking id and cancellation token', async () => {
    const host = {
      _id: 'host-1',
    };
    const eventType = {
      slug: 'intro-call',
      title: '30 min intro call',
      durationMinutes: 30,
    };
    const response = {
      id: 'call-1',
      status: 'CANCELED',
    };
    const hostAccountsService = {
      getBySlug: vi.fn().mockResolvedValue(host),
    };
    const eventTypesService = {
      getActiveByHostIdAndSlug: vi.fn().mockResolvedValue(eventType),
    };
    const callRequestsService = {
      cancelWithToken: vi.fn().mockResolvedValue(response),
    };
    const controller = new PublicBookingAvailabilityController(
      hostAccountsService as unknown as HostAccountsService,
      eventTypesService as unknown as EventTypesService,
      callRequestsService as unknown as CallRequestsService,
    );

    await expect(
      controller.cancelBooking(
        'default-admin',
        'intro-call',
        'call-1',
        'cancel-token',
      ),
    ).resolves.toBe(response);
    expect(hostAccountsService.getBySlug).toHaveBeenCalledWith('default-admin');
    expect(eventTypesService.getActiveByHostIdAndSlug).toHaveBeenCalledWith(
      'host-1',
      'intro-call',
    );
    expect(callRequestsService.cancelWithToken).toHaveBeenCalledWith(
      'call-1',
      'cancel-token',
      eventType,
    );
  });

  it('returns public booking details by booking id and cancellation token', async () => {
    const host = {
      _id: 'host-1',
    };
    const eventType = {
      slug: 'intro-call',
      title: '30 min intro call',
      durationMinutes: 30,
      meetingLocation: 'Google Meet',
    };
    const response = {
      id: 'call-1',
      email: 'user@example.com',
      phoneNumber: '+90 555 111 22 33',
      scheduledAt: '2030-01-01T09:00:00.000Z',
      status: 'SCHEDULED',
      adminNote: 'internal note',
      cancellationToken: 'cancel-token',
      meetingLocation: 'Google Meet',
      createdAt: '2030-01-01T08:00:00.000Z',
      updatedAt: '2030-01-01T08:05:00.000Z',
    };
    const hostAccountsService = {
      getBySlug: vi.fn().mockResolvedValue(host),
    };
    const eventTypesService = {
      getActiveByHostIdAndSlug: vi.fn().mockResolvedValue(eventType),
    };
    const callRequestsService = {
      getPublicBookingWithToken: vi.fn().mockResolvedValue(response),
    };
    const controller = new PublicBookingAvailabilityController(
      hostAccountsService as unknown as HostAccountsService,
      eventTypesService as unknown as EventTypesService,
      callRequestsService as unknown as CallRequestsService,
    );

    await expect(
      controller.getBooking(
        'default-admin',
        'intro-call',
        'call-1',
        'cancel-token',
      ),
    ).resolves.toEqual({
      bookingId: 'call-1',
      email: 'user@example.com',
      phoneNumber: '+90 555 111 22 33',
      scheduledAt: '2030-01-01T09:00:00.000Z',
      status: 'SCHEDULED',
      cancellationToken: 'cancel-token',
      meetingLocation: 'Google Meet',
      eventType: {
        slug: 'intro-call',
        title: '30 min intro call',
        durationMinutes: 30,
        meetingLocation: 'Google Meet',
      },
    });
    expect(callRequestsService.getPublicBookingWithToken).toHaveBeenCalledWith(
      'call-1',
      'cancel-token',
      eventType,
    );
  });

  it('reschedules a booking by booking id and cancellation token', async () => {
    const host = {
      _id: 'host-1',
    };
    const eventType = {
      slug: 'intro-call',
      title: '30 min intro call',
      durationMinutes: 30,
      meetingLocation: 'Zoom',
    };
    const dto = {
      scheduledAt: '2030-01-01T09:30:00.000Z',
    };
    const response = {
      id: 'call-1',
      email: 'user@example.com',
      phoneNumber: '+90 555 111 22 33',
      scheduledAt: '2030-01-01T09:30:00.000Z',
      status: 'REQUESTED',
      adminNote: undefined,
      cancellationToken: 'cancel-token',
      meetingLocation: 'Zoom',
      createdAt: '2030-01-01T08:00:00.000Z',
      updatedAt: '2030-01-01T08:05:00.000Z',
    };
    const hostAccountsService = {
      getBySlug: vi.fn().mockResolvedValue(host),
    };
    const eventTypesService = {
      getActiveByHostIdAndSlug: vi.fn().mockResolvedValue(eventType),
    };
    const callRequestsService = {
      rescheduleWithToken: vi.fn().mockResolvedValue(response),
    };
    const controller = new PublicBookingAvailabilityController(
      hostAccountsService as unknown as HostAccountsService,
      eventTypesService as unknown as EventTypesService,
      callRequestsService as unknown as CallRequestsService,
    );

    await expect(
      controller.rescheduleBooking(
        'default-admin',
        'intro-call',
        'call-1',
        'cancel-token',
        dto,
      ),
    ).resolves.toEqual({
      bookingId: 'call-1',
      email: 'user@example.com',
      phoneNumber: '+90 555 111 22 33',
      scheduledAt: '2030-01-01T09:30:00.000Z',
      status: 'REQUESTED',
      cancellationToken: 'cancel-token',
      meetingLocation: 'Zoom',
      eventType: {
        slug: 'intro-call',
        title: '30 min intro call',
        durationMinutes: 30,
        meetingLocation: 'Zoom',
      },
    });
    expect(hostAccountsService.getBySlug).toHaveBeenCalledWith('default-admin');
    expect(eventTypesService.getActiveByHostIdAndSlug).toHaveBeenCalledWith(
      'host-1',
      'intro-call',
    );
    expect(callRequestsService.rescheduleWithToken).toHaveBeenCalledWith(
      'call-1',
      'cancel-token',
      dto,
      eventType,
    );
  });
});
