import { GUARDS_METADATA } from '@nestjs/common/constants';
import { describe, expect, it, vi } from 'vitest';
import { PublicBookingPagesController } from './public-booking-pages.controller';

describe('PublicBookingPagesController', () => {
  it('keeps the public booking page endpoint unauthenticated', () => {
    const guards =
      Reflect.getMetadata(
        GUARDS_METADATA,
        PublicBookingPagesController.prototype.getByHostSlug,
      ) ?? [];

    expect(guards).toEqual([]);
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
