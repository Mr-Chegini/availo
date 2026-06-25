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
import type { PublicBookingRateLimitStore } from './rate-limit-store';

type RateLimitHandler = () => unknown;

describe('PublicBookingRateLimitGuard', () => {
  it('allows requests within the configured limit', async () => {
    const handler = () => undefined;
    const guard = createGuard({
      PUBLIC_BOOKING_RATE_LIMIT_CREATE_MAX: 2,
    });
    const context = createContext(handler, '127.0.0.1');

    await expect(guard.canActivate(context)).resolves.toBe(true);
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('blocks requests after the configured limit is exceeded', async () => {
    const handler = () => undefined;
    const guard = createGuard({
      PUBLIC_BOOKING_RATE_LIMIT_CREATE_MAX: 1,
    });
    const context = createContext(handler, '127.0.0.1');

    await expect(guard.canActivate(context)).resolves.toBe(true);
    try {
      await guard.canActivate(context);
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  });

  it('tracks forwarded client IPs separately', async () => {
    const handler = () => undefined;
    const guard = createGuard({
      PUBLIC_BOOKING_RATE_LIMIT_CREATE_MAX: 1,
    });

    await expect(
      guard.canActivate(createContext(handler, '203.0.113.1')),
    ).resolves.toBe(true);
    await expect(
      guard.canActivate(createContext(handler, '203.0.113.2')),
    ).resolves.toBe(true);
  });

  it('resets the counter after the configured window', async () => {
    const handler = () => undefined;
    const guard = createGuard({
      PUBLIC_BOOKING_RATE_LIMIT_CREATE_MAX: 1,
      PUBLIC_BOOKING_RATE_LIMIT_WINDOW_SECONDS: 1,
    });
    const context = createContext(handler, '127.0.0.1');
    const nowSpy = vi.spyOn(Date, 'now');

    nowSpy.mockReturnValue(1_000);
    await expect(guard.canActivate(context)).resolves.toBe(true);
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      HttpException,
    );

    nowSpy.mockReturnValue(2_001);
    await expect(guard.canActivate(context)).resolves.toBe(true);

    nowSpy.mockRestore();
  });

  it('fails closed when the rate-limit store fails', async () => {
    const handler = () => undefined;
    const guard = createGuard(
      {
        PUBLIC_BOOKING_RATE_LIMIT_CREATE_MAX: 1,
      },
      {
        consume: vi.fn().mockRejectedValue(new Error('Redis unavailable')),
      },
    );

    await expect(
      guard.canActivate(createContext(handler, '127.0.0.1')),
    ).rejects.toThrow('Redis unavailable');
  });
});

function createGuard(
  configValues: Record<string, number>,
  rateLimitStore: PublicBookingRateLimitStore = new MemoryTestRateLimitStore(),
) {
  const handlerGroups = new Map<
    RateLimitHandler,
    PublicBookingRateLimitGroup
  >();
  const reflector = {
    get: vi.fn((metadataKey: string, handler: RateLimitHandler) => {
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

  return new PublicBookingRateLimitGuard(
    reflector,
    configService,
    rateLimitStore,
  );
}

function createContext(
  handler: RateLimitHandler,
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
  } as unknown as ExecutionContext;
}

class MemoryTestRateLimitStore implements PublicBookingRateLimitStore {
  private readonly entries = new Map<
    string,
    { count: number; resetAt: number }
  >();

  async consume(input: { key: string; windowMs: number }): Promise<number> {
    const now = Date.now();
    const entry = this.entries.get(input.key);

    if (!entry || entry.resetAt <= now) {
      this.entries.set(input.key, {
        count: 1,
        resetAt: now + input.windowMs,
      });
      return 1;
    }

    entry.count += 1;
    return entry.count;
  }
}
