import { describe, expect, it } from 'vitest';
import { CalendarAccountSchema } from './calendar-account.schema';

describe('CalendarAccountSchema', () => {
  it('defines unique provider account index per owner', () => {
    expect(CalendarAccountSchema.indexes()).toContainEqual([
      {
        ownerId: 1,
        provider: 1,
        providerAccountId: 1,
      },
      {
        name: 'uniq_calendar_accounts_owner_provider_account',
        unique: true,
      },
    ]);
  });

  it('defines active account lookup index per owner', () => {
    expect(CalendarAccountSchema.indexes()).toContainEqual([
      {
        ownerId: 1,
        isActive: 1,
      },
      {
        name: 'idx_calendar_accounts_owner_active',
      },
    ]);
  });
});
