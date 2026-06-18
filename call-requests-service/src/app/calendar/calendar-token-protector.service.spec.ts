import { NotImplementedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';
import { CalendarTokenProtector } from './calendar-token-protector.service';

describe('CalendarTokenProtector', () => {
  it('protects and restores a calendar token value', () => {
    const protector = new CalendarTokenProtector({
      get: vi.fn().mockReturnValue('calendar-token-secret'),
    } as unknown as ConfigService);

    const protectedToken = protector.protect('google-refresh-token');

    expect(protectedToken).not.toBe('google-refresh-token');
    expect(protectedToken).toMatch(/^v1:/);
    expect(protector.restore(protectedToken)).toBe('google-refresh-token');
  });

  it('uses a random initialization vector for each protected value', () => {
    const protector = new CalendarTokenProtector({
      get: vi.fn().mockReturnValue('calendar-token-secret'),
    } as unknown as ConfigService);

    expect(protector.protect('google-refresh-token')).not.toBe(
      protector.protect('google-refresh-token'),
    );
  });

  it('throws when token protection is not configured', () => {
    const protector = new CalendarTokenProtector({
      get: vi.fn().mockReturnValue(undefined),
    } as unknown as ConfigService);

    expect(() => protector.protect('google-refresh-token')).toThrow(
      NotImplementedException,
    );
  });
});
