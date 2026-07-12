import { UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdminSessionService } from './admin-session.service';

describe('AdminSessionService', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('issues and verifies signed admin session tokens', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2030-01-01T00:00:00.000Z'));
    const service = new AdminSessionService(createConfigService());

    const result = service.login('admin@availo.local', 'correct-password');

    expect(result.tokenType).toBe('Bearer');
    expect(result.expiresAt).toBe('2030-01-01T08:00:00.000Z');
    expect(service.verifyAccessToken(result.accessToken)).toEqual({
      sub: 'admin@availo.local',
      issuedAt: '2030-01-01T00:00:00.000Z',
      expiresAt: '2030-01-01T08:00:00.000Z',
    });
  });

  it('rejects invalid credentials', () => {
    const service = new AdminSessionService(createConfigService());

    expect(() => service.login('admin@availo.local', 'wrong-password')).toThrow(
      UnauthorizedException,
    );
  });

  it('rejects expired or tampered tokens', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2030-01-01T00:00:00.000Z'));
    const service = new AdminSessionService(createConfigService());
    const result = service.login('admin@availo.local', 'correct-password');

    vi.setSystemTime(new Date('2030-01-01T08:00:01.000Z'));

    expect(() => service.verifyAccessToken(result.accessToken)).toThrow(
      UnauthorizedException,
    );
    expect(() => service.verifyAccessToken(`${result.accessToken}x`)).toThrow(
      UnauthorizedException,
    );
  });

  it('rejects sessions issued for a previously configured admin', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2030-01-01T00:00:00.000Z'));
    const values = createConfigValues();
    const service = new AdminSessionService(createConfigService(values));
    const result = service.login('admin@availo.local', 'correct-password');

    values.set('ADMIN_EMAIL', 'new-admin@availo.local');

    expect(() => service.verifyAccessToken(result.accessToken)).toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a session whose issue time is in the future', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2030-01-01T00:00:00.000Z'));
    const service = new AdminSessionService(createConfigService());
    const result = service.login('admin@availo.local', 'correct-password');

    vi.setSystemTime(new Date('2029-12-31T23:59:59.000Z'));

    expect(() => service.verifyAccessToken(result.accessToken)).toThrow(
      UnauthorizedException,
    );
  });
});

function createConfigValues(): Map<string, string | number> {
  return new Map<string, string | number>([
    ['ADMIN_EMAIL', 'admin@availo.local'],
    ['ADMIN_PASSWORD', 'correct-password'],
    ['ADMIN_SESSION_SECRET', 'test-admin-session-secret'],
    ['ADMIN_SESSION_TTL_SECONDS', 28800],
  ]);
}

function createConfigService(values = createConfigValues()): ConfigService {
  return {
    get: (key: string) => values.get(key),
    getOrThrow: (key: string) => {
      const value = values.get(key);

      if (value === undefined) {
        throw new Error(`Missing config value ${key}`);
      }

      return value;
    },
  } as unknown as ConfigService;
}
