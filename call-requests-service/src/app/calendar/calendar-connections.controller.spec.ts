import { GUARDS_METADATA } from '@nestjs/common/constants';
import { describe, expect, it, vi } from 'vitest';
import { AdminApiKeyGuard } from '../auth/admin-api-key.guard';
import { CalendarConnectionsController } from './calendar-connections.controller';

describe('CalendarConnectionsController', () => {
  it.each(['listConnections', 'startGoogleConnection'] as const)(
    'protects %s with the admin API key guard',
    (methodName) => {
      expect(getMethodGuards(methodName)).toContain(AdminApiKeyGuard);
    },
  );

  it('keeps the Google OAuth callback public', () => {
    expect(getMethodGuards('handleGoogleCallback')).not.toContain(
      AdminApiKeyGuard,
    );
  });

  it('passes Google callback query params to the connection service', () => {
    const calendarConnectionsService = {
      handleGoogleCallback: vi.fn().mockReturnValue({
        ownerId: 'owner-1',
        message: 'Google Calendar OAuth callback verified',
      }),
    };
    const controller = new CalendarConnectionsController(
      calendarConnectionsService as unknown as never,
    );

    expect(
      controller.handleGoogleCallback('authorization-code', 'signed-state'),
    ).toEqual({
      ownerId: 'owner-1',
      message: 'Google Calendar OAuth callback verified',
    });
    expect(
      calendarConnectionsService.handleGoogleCallback,
    ).toHaveBeenCalledWith('authorization-code', 'signed-state');
  });
});

function getMethodGuards(
  methodName: keyof CalendarConnectionsController,
): unknown[] {
  const handler = CalendarConnectionsController.prototype[methodName];

  return Reflect.getMetadata(GUARDS_METADATA, handler) ?? [];
}
