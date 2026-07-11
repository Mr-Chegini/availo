import { GUARDS_METADATA } from '@nestjs/common/constants';
import { describe, expect, it, vi } from 'vitest';
import { PublicBookingPagesController } from './public-booking-pages.controller';
import { AdminSessionGuard } from '../auth/admin-session.guard';
import { PUBLIC_BOOKING_RATE_LIMIT_METADATA } from '../rate-limit/public-booking-rate-limit.decorator';
import { PublicBookingRateLimitGuard } from '../rate-limit/public-booking-rate-limit.guard';

describe('PublicBookingPagesController', () => {
  it('keeps the public booking page endpoint unauthenticated and rate limited', () => {
    const guards =
      Reflect.getMetadata(
        GUARDS_METADATA,
        PublicBookingPagesController.prototype.getByHostSlug,
      ) ?? [];

    expect(guards).toContain(PublicBookingRateLimitGuard);
    expect(guards).not.toContain(AdminSessionGuard);
    expect(
      Reflect.getMetadata(
        PUBLIC_BOOKING_RATE_LIMIT_METADATA,
        PublicBookingPagesController.prototype.getByHostSlug,
      ),
    ).toBe('lookup');
  });

  it('looks up the booking page by host slug', async () => {
    const publicBookingPagesService = {
      getByHostSlug: vi.fn().mockResolvedValue({
        host: {
          slug: 'default-admin',
        },
        eventTypes: [],
      }),
    };
    const controller = new PublicBookingPagesController(
      publicBookingPagesService as never,
    );

    await expect(controller.getByHostSlug('default-admin')).resolves.toEqual({
      host: {
        slug: 'default-admin',
      },
      eventTypes: [],
    });
    expect(publicBookingPagesService.getByHostSlug).toHaveBeenCalledWith(
      'default-admin',
    );
  });
});
