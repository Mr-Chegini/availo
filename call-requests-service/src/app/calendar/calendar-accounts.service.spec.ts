import { describe, expect, it, vi } from 'vitest';
import { CalendarAccountsService } from './calendar-accounts.service';
import type { CalendarAccountDocument } from './calendar-account.schema';

describe('CalendarAccountsService', () => {
  it('finds active calendar accounts by owner', async () => {
    const calendarAccounts = [{ ownerId: 'owner-1' }];
    const model = {
      find: vi.fn().mockReturnValue({
        sort: vi.fn().mockReturnValue({
          exec: vi.fn().mockResolvedValue(calendarAccounts),
        }),
      }),
    };
    const service = new CalendarAccountsService(model as unknown as never);

    await expect(service.findActiveByOwner('owner-1')).resolves.toBe(
      calendarAccounts,
    );
    expect(model.find).toHaveBeenCalledWith({
      ownerId: 'owner-1',
      isActive: true,
    });
  });

  it('upserts a connected calendar account', async () => {
    const tokenExpiresAt = new Date('2030-01-01T00:00:00.000Z');
    const calendarAccount = { ownerId: 'owner-1' };
    const model = {
      findOneAndUpdate: vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(calendarAccount),
      }),
    };
    const service = new CalendarAccountsService(model as unknown as never);

    await expect(
      service.upsertConnectedAccount({
        ownerId: 'owner-1',
        provider: 'google',
        providerAccountId: 'google-account-1',
        primaryCalendarId: 'primary',
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        tokenExpiresAt,
      }),
    ).resolves.toBe(calendarAccount as CalendarAccountDocument);

    expect(model.findOneAndUpdate).toHaveBeenCalledWith(
      {
        ownerId: 'owner-1',
        provider: 'google',
        providerAccountId: 'google-account-1',
      },
      {
        $set: {
          primaryCalendarId: 'primary',
          accessToken: 'access-token',
          refreshToken: 'refresh-token',
          tokenExpiresAt,
          isActive: true,
        },
        $setOnInsert: {
          ownerId: 'owner-1',
          provider: 'google',
          providerAccountId: 'google-account-1',
        },
      },
      {
        new: true,
        upsert: true,
      },
    );
  });
});
