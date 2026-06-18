import { describe, expect, it, vi } from 'vitest';
import { CalendarConnectionsController } from './calendar-connections.controller';

describe('CalendarConnectionsController', () => {
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
