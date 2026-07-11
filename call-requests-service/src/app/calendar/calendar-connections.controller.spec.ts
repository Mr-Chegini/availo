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

  it('passes optional host slug to protected calendar connection endpoints', async () => {
    const calendarConnectionsService = {
      listConnections: vi.fn().mockResolvedValue([]),
      startGoogleConnection: vi.fn().mockResolvedValue({
        authorizationUrl: 'https://accounts.google.com/oauth',
      }),
    };
    const controller = new CalendarConnectionsController(
      calendarConnectionsService as unknown as never,
    );

    await expect(controller.listConnections('default-admin')).resolves.toEqual(
      [],
    );
    await expect(
      controller.startGoogleConnection('default-admin'),
    ).resolves.toEqual({
      authorizationUrl: 'https://accounts.google.com/oauth',
    });
    expect(calendarConnectionsService.listConnections).toHaveBeenCalledWith(
      'default-admin',
    );
    expect(
      calendarConnectionsService.startGoogleConnection,
    ).toHaveBeenCalledWith('default-admin');
  });

  it('passes Google callback query params to the connection service', async () => {
    const calendarConnectionsService = {
      handleGoogleCallback: vi.fn().mockResolvedValue({
        ownerId: 'owner-1',
        provider: 'google',
        providerAccountId: 'owner-1@gmail.com',
        primaryCalendarId: 'owner-1@gmail.com',
        message: 'Google Calendar connected',
      }),
    };
    const controller = new CalendarConnectionsController(
      calendarConnectionsService as unknown as never,
    );

    await expect(
      controller.handleGoogleCallback('authorization-code', 'signed-state'),
    ).resolves.toEqual({
      ownerId: 'owner-1',
      provider: 'google',
      providerAccountId: 'owner-1@gmail.com',
      primaryCalendarId: 'owner-1@gmail.com',
      message: 'Google Calendar connected',
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
