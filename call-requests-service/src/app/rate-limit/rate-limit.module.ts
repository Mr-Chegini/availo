import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MemoryPublicBookingRateLimitStore } from './memory-public-booking-rate-limit.store';
import { PublicBookingRateLimitGuard } from './public-booking-rate-limit.guard';
import { PUBLIC_BOOKING_RATE_LIMIT_STORE } from './rate-limit-store';
import { RedisPublicBookingRateLimitStore } from './redis-public-booking-rate-limit.store';

@Module({
  providers: [
    PublicBookingRateLimitGuard,
    MemoryPublicBookingRateLimitStore,
    RedisPublicBookingRateLimitStore,
    {
      provide: PUBLIC_BOOKING_RATE_LIMIT_STORE,
      inject: [
        ConfigService,
        MemoryPublicBookingRateLimitStore,
        RedisPublicBookingRateLimitStore,
      ],
      useFactory: (
        configService: ConfigService,
        memoryStore: MemoryPublicBookingRateLimitStore,
        redisStore: RedisPublicBookingRateLimitStore,
      ) => {
        return configService.get<string>(
          'PUBLIC_BOOKING_RATE_LIMIT_STORE',
          'memory',
        ) === 'redis'
          ? redisStore
          : memoryStore;
      },
    },
  ],
  exports: [PublicBookingRateLimitGuard],
})
export class RateLimitModule {}
