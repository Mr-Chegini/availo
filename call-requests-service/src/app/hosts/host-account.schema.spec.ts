import { describe, expect, it } from 'vitest';
import { HostAccountSchema } from './host-account.schema';

describe('HostAccountSchema', () => {
  it('requires host account identity fields', () => {
    expect(HostAccountSchema.path('name')?.isRequired).toBe(true);
    expect(HostAccountSchema.path('email')?.isRequired).toBe(true);
    expect(HostAccountSchema.path('slug')?.isRequired).toBe(true);
    expect(HostAccountSchema.path('timezone')?.isRequired).toBe(true);
  });

  it('defines a unique email index', () => {
    expect(HostAccountSchema.indexes()).toContainEqual([
      {
        email: 1,
      },
      {
        name: 'uniq_host_accounts_email',
        unique: true,
      },
    ]);
  });

  it('defines a unique slug index', () => {
    expect(HostAccountSchema.indexes()).toContainEqual([
      {
        slug: 1,
      },
      {
        name: 'uniq_host_accounts_slug',
        unique: true,
      },
    ]);
  });
});
