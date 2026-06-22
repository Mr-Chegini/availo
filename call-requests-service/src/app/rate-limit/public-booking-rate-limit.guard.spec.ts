import type { ConfigService } from '@nestjs/config';
import type { ExecutionContext } from '@nestjs/common';
import { HttpException, HttpStatus } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import {
  PUBLIC_BOOKING_RATE_LIMIT_METADATA,
  type PublicBookingRateLimitGroup,
} from './public-booking-rate-limit.decorator';
import { PublicBookingRateLimitGuard } from './public-booking-rate-limit.guard';

describe('PublicBookingRateLimitGuard', () => {
  it('allows requests within the configured limit', () => {
    const handler = () => undefined;
    const guard = createGuard({
      PUBLIC_BOOKING_RATE_LIMIT_CREATE_MAX: 2,
    });
    const context = createContext(handler, '127.0.0.1');

    expect(guard.canActivate(context)).toBe(true);
    expect(guard.canActivate(context)).toBe(true);
  });

  it('blocks requests after the configured limit is exceeded', () => {
    const handler = () => undefined;
    const guard = createGuard({
      PUBLIC_BOOKING_RATE_LIMIT_CREATE_MAX: 1,
    });
    const context = createContext(handler, '127.0.0.1');

    expect(guard.canActivate(context)).toBe(true);
    expect(() => guard.canActivate(context)).toThrow(HttpException);
    try {
      guard.canActivate(context);
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  });

  it('tracks forwarded client IPs separately', () => {
    const handler = () => undefined;
    const guard = createGuard({
      PUBLIC_BOOKING_RATE_LIMIT_CREATE_MAX: 1,
    });

    expect(guard.canActivate(createContext(handler, '203.0.113.1'))).toBe(true);
    expect(guard.canActivate(createContext(handler, '203.0.113.2'))).toBe(true);
  });

  it('resets the counter after the configured window', () => {
    const handler = () => undefined;
    const guard = createGuard({
      PUBLIC_BOOKING_RATE_LIMIT_CREATE_MAX: 1,
      PUBLIC_BOOKING_RATE_LIMIT_WINDOW_SECONDS: 1,
    });
    const context = createContext(handler, '127.0.0.1');
    const nowSpy = vi.spyOn(Date, 'now');

    nowSpy.mockReturnValue(1_000);
    expect(guard.canActivate(context)).toBe(true);
    expect(() => guard.canActivate(context)).toThrow(HttpException);

    nowSpy.mockReturnValue(2_001);
    expect(guard.canActivate(context)).toBe(true);

    nowSpy.mockRestore();
  });
});

function createGuard(configValues: Record<string, number>) {
  const handlerGroups = new Map<Function, PublicBookingRateLimitGroup>();
  const reflector = {
    get: vi.fn((metadataKey: string, handler: Function) => {
      if (metadataKey !== PUBLIC_BOOKING_RATE_LIMIT_METADATA) {
        return undefined;
      }

      if (!handlerGroups.has(handler)) {
        handlerGroups.set(handler, 'create');
      }

      return handlerGroups.get(handler);
    }),
  } as unknown as Reflector;
  const configService = {
    get: vi.fn((key: string, defaultValue?: unknown) => {
      return configValues[key] ?? defaultValue;
    }),
  } as unknown as ConfigService;

  return new PublicBookingRateLimitGuard(reflector, configService);
}

function createContext(
  handler: Function,
  forwardedIp: string,
): ExecutionContext {
  return {
    getHandler: () => handler,
    switchToHttp: () => ({
      getRequest: () => ({
        headers: {
          'x-forwarded-for': forwardedIp,
        },
      }),
    }),
  } as ExecutionContext;
}
