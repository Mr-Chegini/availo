import { Injectable } from '@nestjs/common';
import type {
  ConsumeRateLimitInput,
  PublicBookingRateLimitStore,
} from './rate-limit-store';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

@Injectable()
export class MemoryPublicBookingRateLimitStore implements PublicBookingRateLimitStore {
  private readonly entries = new Map<string, RateLimitEntry>();

  async consume(input: ConsumeRateLimitInput): Promise<number> {
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
