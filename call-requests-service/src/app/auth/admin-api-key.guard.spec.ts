import { UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { ExecutionContext } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { AdminApiKeyGuard } from './admin-api-key.guard';

describe('AdminApiKeyGuard', () => {
  it('allows requests with a matching x-admin-api-key header', () => {
    const guard = new AdminApiKeyGuard(createConfigService('secret-key'));

    expect(
      guard.canActivate(
        createExecutionContext({ 'x-admin-api-key': 'secret-key' }),
      ),
    ).toBe(true);
  });

  it('allows requests with a matching bearer token', () => {
    const guard = new AdminApiKeyGuard(createConfigService('secret-key'));

    expect(
      guard.canActivate(
        createExecutionContext({ authorization: 'Bearer secret-key' }),
      ),
    ).toBe(true);
  });

  it('rejects requests without a matching admin API key', () => {
    const guard = new AdminApiKeyGuard(createConfigService('secret-key'));

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
