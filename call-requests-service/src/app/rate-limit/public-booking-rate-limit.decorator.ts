import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';
import { PublicBookingRateLimitGuard } from './public-booking-rate-limit.guard';

export const PUBLIC_BOOKING_RATE_LIMIT_METADATA = 'public-booking-rate-limit';

export type PublicBookingRateLimitGroup =
  | 'lookup'
  | 'availability'
  | 'create'
  | 'manage';

export function PublicBookingRateLimit(
  group: PublicBookingRateLimitGroup,
): MethodDecorator {
  return applyDecorators(
    SetMetadata(PUBLIC_BOOKING_RATE_LIMIT_METADATA, group),
    UseGuards(PublicBookingRateLimitGuard),
  );
}
