import { describe, expect, it, vi } from 'vitest';
import { RedisPublicBookingRateLimitStore } from './redis-public-booking-rate-limit.store';

describe('RedisPublicBookingRateLimitStore', () => {
  it('uses an atomic Redis script with TTL for rate-limit counters', async () => {
    const redisClient = {
      eval: vi.fn().mockResolvedValue(3),
    };
    const store = new RedisPublicBookingRateLimitStore({
      getOrThrow: () => 'redis://localhost:6379',
    } as never);
    vi.spyOn(
      store as unknown as { getClient: () => Promise<typeof redisClient> },
      'getClient',
    ).mockResolvedValue(redisClient);

    await expect(
      store.consume({
        key: 'availo:rate-limit:public-booking:create:127.0.0.1',
        windowMs: 60_000,
      }),
    ).resolves.toBe(3);

    expect(redisClient.eval).toHaveBeenCalledWith(expect.any(String), {
      keys: ['availo:rate-limit:public-booking:create:127.0.0.1'],
      arguments: ['60000'],
    });
    expect(redisClient.eval.mock.calls[0][0]).toContain('INCR');
    expect(redisClient.eval.mock.calls[0][0]).toContain('PEXPIRE');
  });

  it('throws when Redis returns a non-number response', async () => {
    const redisClient = {
      eval: vi.fn().mockResolvedValue('unexpected'),
    };
    const store = new RedisPublicBookingRateLimitStore({
      getOrThrow: () => 'redis://localhost:6379',
    } as never);
    vi.spyOn(
      store as unknown as { getClient: () => Promise<typeof redisClient> },
      'getClient',
    ).mockResolvedValue(redisClient);

    await expect(
      store.consume({
        key: 'availo:rate-limit:public-booking:create:127.0.0.1',
        windowMs: 60_000,
      }),
    ).rejects.toThrow('Redis rate-limit script did not return a number');
  });
});
