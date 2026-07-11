import { UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { ExecutionContext } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AdminApiKeyGuard } from './admin-api-key.guard';
import type { AdminSessionService } from './admin-session.service';

describe('AdminApiKeyGuard', () => {
  it('allows requests with a matching x-admin-api-key header', () => {
    const guard = new AdminApiKeyGuard(
      createConfigService('secret-key'),
      createAdminSessionService(),
    );

    expect(
      guard.canActivate(
        createExecutionContext({ 'x-admin-api-key': 'secret-key' }),
      ),
    ).toBe(true);
  });

  it('allows requests with a matching bearer token', () => {
    const guard = new AdminApiKeyGuard(
      createConfigService('secret-key'),
      createAdminSessionService({
        verifyAccessToken: vi.fn(() => {
          throw new UnauthorizedException();
        }),
      }),
    );

    expect(
      guard.canActivate(
        createExecutionContext({ authorization: 'Bearer secret-key' }),
      ),
    ).toBe(true);
  });

  it('allows requests with a valid admin session bearer token', () => {
    const adminSessionService = createAdminSessionService();
    const guard = new AdminApiKeyGuard(
      createConfigService('secret-key'),
      adminSessionService,
    );

    expect(
      guard.canActivate(
        createExecutionContext({ authorization: 'Bearer session-token' }),
      ),
    ).toBe(true);
    expect(adminSessionService.verifyAccessToken).toHaveBeenCalledWith(
      'session-token',
    );
  });

  it('rejects requests without a matching admin API key', () => {
    const guard = new AdminApiKeyGuard(
      createConfigService('secret-key'),
      createAdminSessionService({
        verifyAccessToken: vi.fn(() => {
          throw new UnauthorizedException();
        }),
      }),
    );

    expect(() =>
      guard.canActivate(createExecutionContext({ 'x-admin-api-key': 'wrong' })),
    ).toThrow(UnauthorizedException);
  });
});

function createConfigService(apiKey: string): ConfigService {
  return {
    getOrThrow: () => apiKey,
  } as unknown as ConfigService;
}

function createAdminSessionService(
  overrides: Partial<{
    verifyAccessToken: ReturnType<typeof vi.fn>;
  }> = {},
): AdminSessionService {
  return {
    verifyAccessToken: vi.fn().mockReturnValue({
      sub: 'admin@example.com',
      issuedAt: '2030-01-01T00:00:00.000Z',
      expiresAt: '2030-01-01T08:00:00.000Z',
    }),
    ...overrides,
  } as unknown as AdminSessionService;
}

function createExecutionContext(
  headers: Record<string, string>,
): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        headers,
      }),
    }),
  } as unknown as ExecutionContext;
}
