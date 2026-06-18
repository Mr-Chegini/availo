import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { CalendarAccountsService } from './calendar-accounts.service';
import type { CalendarAccountDocument } from './calendar-account.schema';

describe('CalendarAccountsService', () => {
  const createTokenProtector = () => ({
    protect: vi.fn((token: string) => `protected:${token}`),
  });

  it('finds active calendar accounts by owner', async () => {
    const calendarAccounts = [{ ownerId: 'owner-1' }];
    const model = {
      find: vi.fn().mockReturnValue({
        sort: vi.fn().mockReturnValue({
          exec: vi.fn().mockResolvedValue(calendarAccounts),
        }),
      }),
    };
    const service = new CalendarAccountsService(
      model as unknown as never,
      createTokenProtector() as unknown as never,
    );

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
    const tokenProtector = createTokenProtector();
    const service = new CalendarAccountsService(
      model as unknown as never,
      tokenProtector as unknown as never,
    );

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
          accessToken: 'protected:access-token',
          refreshToken: 'protected:refresh-token',
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
    expect(tokenProtector.protect).toHaveBeenCalledWith('access-token');
    expect(tokenProtector.protect).toHaveBeenCalledWith('refresh-token');
  });

  it('updates OAuth token fields for a calendar account', async () => {
    const tokenExpiresAt = new Date('2030-01-01T00:00:00.000Z');
    const calendarAccount = {
      id: 'account-1',
      accessToken: 'new-access-token',
    };
    const model = {
      findByIdAndUpdate: vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(calendarAccount),
      }),
    };
    const tokenProtector = createTokenProtector();
    const service = new CalendarAccountsService(
      model as unknown as never,
      tokenProtector as unknown as never,
    );

    await expect(
      service.updateTokens({
        accountId: 'account-1',
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
        tokenExpiresAt,
      }),
    ).resolves.toBe(calendarAccount as CalendarAccountDocument);

    expect(model.findByIdAndUpdate).toHaveBeenCalledWith(
      'account-1',
      {
        $set: {
          accessToken: 'protected:new-access-token',
          refreshToken: 'protected:new-refresh-token',
          tokenExpiresAt,
        },
      },
      {
        new: true,
      },
    );
    expect(tokenProtector.protect).toHaveBeenCalledWith('new-access-token');
    expect(tokenProtector.protect).toHaveBeenCalledWith('new-refresh-token');
  });

  it('throws when updating token fields for a missing calendar account', async () => {
    const model = {
      findByIdAndUpdate: vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(null),
      }),
    };
    const service = new CalendarAccountsService(
      model as unknown as never,
      createTokenProtector() as unknown as never,
    );

    await expect(
      service.updateTokens({
        accountId: 'missing-account',
        accessToken: 'new-access-token',
      }),
    ).rejects.toThrow(NotFoundException);
  });
});
