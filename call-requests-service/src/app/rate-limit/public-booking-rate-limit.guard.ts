import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import {
  PUBLIC_BOOKING_RATE_LIMIT_METADATA,
  type PublicBookingRateLimitGroup,
} from './public-booking-rate-limit.decorator';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

@Injectable()
export class PublicBookingRateLimitGuard implements CanActivate {
  private readonly entries = new Map<string, RateLimitEntry>();

  constructor(
    private readonly reflector: Reflector,
    private readonly configService: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const group = this.reflector.get<PublicBookingRateLimitGroup>(
      PUBLIC_BOOKING_RATE_LIMIT_METADATA,
      context.getHandler(),
    );

    if (!group) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const clientIp = getClientIp(request);
    const config = this.getRateLimitConfig(group);
    const key = `${group}:${clientIp}`;
    const now = Date.now();
    const entry = this.entries.get(key);

    if (!entry || entry.resetAt <= now) {
      this.entries.set(key, {
        count: 1,
        resetAt: now + config.windowMs,
      });
      return true;
    }

    if (entry.count >= config.maxRequests) {
      throw new HttpException(
        'Too many public booking requests. Please try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    entry.count += 1;
    return true;
  }

  private getRateLimitConfig(
    group: PublicBookingRateLimitGroup,
  ): RateLimitConfig {
    const defaultMaxRequests = {
      lookup: 120,
      availability: 120,
      create: 10,
      manage: 30,
    } satisfies Record<PublicBookingRateLimitGroup, number>;
    const maxRequestsKey = {
      lookup: 'PUBLIC_BOOKING_RATE_LIMIT_LOOKUP_MAX',
      availability: 'PUBLIC_BOOKING_RATE_LIMIT_AVAILABILITY_MAX',
      create: 'PUBLIC_BOOKING_RATE_LIMIT_CREATE_MAX',
      manage: 'PUBLIC_BOOKING_RATE_LIMIT_MANAGE_MAX',
    } satisfies Record<PublicBookingRateLimitGroup, string>;
    const configuredMaxRequests = Number(
      this.configService.get<number>(
        maxRequestsKey[group],
        defaultMaxRequests[group],
      ),
    );
    const configuredWindowSeconds = Number(
      this.configService.get<number>(
        'PUBLIC_BOOKING_RATE_LIMIT_WINDOW_SECONDS',
        60,
      ),
    );

    return {
      maxRequests:
        Number.isFinite(configuredMaxRequests) && configuredMaxRequests > 0
          ? Math.floor(configuredMaxRequests)
          : defaultMaxRequests[group],
      windowMs:
        Number.isFinite(configuredWindowSeconds) && configuredWindowSeconds > 0
          ? Math.floor(configuredWindowSeconds) * 1000
          : 60_000,
    };
  }
}

function getClientIp(request: {
  headers?: Record<string, string | string[] | undefined>;
  ip?: string;
  socket?: { remoteAddress?: string };
}): string {
  const forwardedFor = request.headers?.['x-forwarded-for'];

  if (Array.isArray(forwardedFor)) {
    return forwardedFor[0]?.split(',')[0]?.trim() || 'unknown';
  }

  if (forwardedFor) {
    return forwardedFor.split(',')[0]?.trim() || 'unknown';
  }

  return request.ip ?? request.socket?.remoteAddress ?? 'unknown';
}
