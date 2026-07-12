import { UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AdminSessionGuard } from './admin-session.guard';
import type { AdminSessionService } from './admin-session.service';

describe('AdminSessionGuard', () => {
  it('allows requests with a valid admin session bearer token', () => {
    const adminSessionService = createAdminSessionService();
    const guard = new AdminSessionGuard(adminSessionService);
    const request = { headers: { authorization: 'Bearer session-token' } };

    expect(guard.canActivate(createExecutionContext(request))).toBe(true);
    expect(adminSessionService.verifyAccessToken).toHaveBeenCalledWith(
      'session-token',
    );
    expect(request).toMatchObject({
      admin: { sub: 'admin@example.com' },
    });
  });

  it('rejects requests without an admin session bearer token', () => {
    const guard = new AdminSessionGuard(createAdminSessionService());

    expect(() =>
      guard.canActivate(createExecutionContext({ 'x-admin-api-key': 'wrong' })),
    ).toThrow(UnauthorizedException);
  });

  it('rejects invalid admin session bearer tokens', () => {
    const guard = new AdminSessionGuard(
      createAdminSessionService({
        verifyAccessToken: vi.fn(() => {
          throw new UnauthorizedException();
        }),
      }),
    );

    expect(() =>
      guard.canActivate(
        createExecutionContext({ authorization: 'Bearer invalid-session' }),
      ),
    ).toThrow(UnauthorizedException);
  });
});

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

function createExecutionContext(request: {
  headers?: Record<string, string>;
  [key: string]: unknown;
}): ExecutionContext {
  const normalizedRequest = request.headers ? request : { headers: request };

  return {
    switchToHttp: () => ({
      getRequest: () => normalizedRequest,
    }),
  } as unknown as ExecutionContext;
}
