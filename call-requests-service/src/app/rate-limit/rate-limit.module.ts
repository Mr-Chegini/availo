import { Module } from '@nestjs/common';
import { PublicBookingRateLimitGuard } from './public-booking-rate-limit.guard';

@Module({
  providers: [PublicBookingRateLimitGuard],
  exports: [PublicBookingRateLimitGuard],
})
export class RateLimitModule {}
