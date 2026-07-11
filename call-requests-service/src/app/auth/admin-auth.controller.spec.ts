import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AdminAuthController } from './admin-auth.controller';
import type { AdminSessionService } from './admin-session.service';

describe('AdminAuthController', () => {
  it('logs in with admin credentials', () => {
    const adminSessionService = {
      login: vi.fn().mockReturnValue({
        accessToken: 'session-token',
        tokenType: 'Bearer',
        expiresAt: '2030-01-01T08:00:00.000Z',
      }),
    };
    const controller = new AdminAuthController(
      adminSessionService as unknown as AdminSessionService,
    );

    expect(
      controller.login({
        email: ' admin@availo.local ',
        password: 'correct-password',
      }),
    ).toEqual({
      accessToken: 'session-token',
      tokenType: 'Bearer',
      expiresAt: '2030-01-01T08:00:00.000Z',
    });
    expect(adminSessionService.login).toHaveBeenCalledWith(
      'admin@availo.local',
      'correct-password',
    );
  });

  it('rejects missing login fields', () => {
    const controller = new AdminAuthController({
      login: vi.fn(),
    } as unknown as AdminSessionService);

    expect(() => controller.login({ password: 'correct-password' })).toThrow(
      BadRequestException,
    );
    expect(() => controller.login({ email: 'admin@availo.local' })).toThrow(
      BadRequestException,
    );
  });
});
