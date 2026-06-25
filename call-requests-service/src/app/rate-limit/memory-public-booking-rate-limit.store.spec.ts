import { describe, expect, it, vi } from 'vitest';
import { MemoryPublicBookingRateLimitStore } from './memory-public-booking-rate-limit.store';

describe('MemoryPublicBookingRateLimitStore', () => {
  it('increments counts within a window', async () => {
    const store = new MemoryPublicBookingRateLimitStore();

    await expect(
      store.consume({ key: 'rate-limit-key', windowMs: 60_000 }),
    ).resolves.toBe(1);
    await expect(
      store.consume({ key: 'rate-limit-key', windowMs: 60_000 }),
    ).resolves.toBe(2);
  });

  it('resets counts after a window', async () => {
    const store = new MemoryPublicBookingRateLimitStore();
    const nowSpy = vi.spyOn(Date, 'now');

    nowSpy.mockReturnValue(1_000);
    await expect(
      store.consume({ key: 'rate-limit-key', windowMs: 1_000 }),
    ).resolves.toBe(1);
    await expect(
      store.consume({ key: 'rate-limit-key', windowMs: 1_000 }),
    ).resolves.toBe(2);

    nowSpy.mockReturnValue(2_001);
    await expect(
      store.consume({ key: 'rate-limit-key', windowMs: 1_000 }),
    ).resolves.toBe(1);

    nowSpy.mockRestore();
  });
});
