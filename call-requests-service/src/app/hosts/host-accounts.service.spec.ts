import { describe, expect, it, vi } from 'vitest';
import { HostAccountsService } from './host-accounts.service';
import type { HostAccountDocument } from './host-account.schema';

describe('HostAccountsService', () => {
  it('creates a host account', async () => {
    const hostAccount = {
      id: 'host-1',
      email: 'admin@example.com',
      slug: 'admin',
    };
    const model = {
      create: vi.fn().mockResolvedValue(hostAccount),
    };
    const service = new HostAccountsService(model as unknown as never);

    await expect(
      service.createHost({
        name: 'Admin User',
        email: 'admin@example.com',
        slug: 'admin',
        timezone: 'Europe/Istanbul',
      }),
    ).resolves.toBe(hostAccount as HostAccountDocument);
    expect(model.create).toHaveBeenCalledWith({
      name: 'Admin User',
      email: 'admin@example.com',
      slug: 'admin',
      timezone: 'Europe/Istanbul',
    });
  });

  it('finds a host account by id', async () => {
    const hostAccount = { id: 'host-1' };
    const model = {
      findById: vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(hostAccount),
      }),
    };
    const service = new HostAccountsService(model as unknown as never);

    await expect(service.findById('host-1')).resolves.toBe(
      hostAccount as HostAccountDocument,
    );
    expect(model.findById).toHaveBeenCalledWith('host-1');
  });

  it('finds a host account by slug', async () => {
    const hostAccount = { slug: 'admin' };
    const model = {
      findOne: vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(hostAccount),
      }),
    };
    const service = new HostAccountsService(model as unknown as never);

    await expect(service.findBySlug('admin')).resolves.toBe(
      hostAccount as HostAccountDocument,
    );
    expect(model.findOne).toHaveBeenCalledWith({ slug: 'admin' });
  });

  it('gets a host account by slug', async () => {
    const hostAccount = { slug: 'admin' };
    const model = {
      findOne: vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(hostAccount),
      }),
    };
    const service = new HostAccountsService(model as unknown as never);

    await expect(service.getBySlug('admin')).resolves.toBe(
      hostAccount as HostAccountDocument,
    );
    expect(model.findOne).toHaveBeenCalledWith({ slug: 'admin' });
  });

  it('throws when getting a missing host account by slug', async () => {
    const model = {
      findOne: vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(null),
      }),
    };
    const service = new HostAccountsService(model as unknown as never);

    await expect(service.getBySlug('missing')).rejects.toThrow(
      'Host account was not found',
    );
  });

  it('returns the existing default host account', async () => {
    const hostAccount = { slug: 'default-admin' };
    const model = {
      findOne: vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(hostAccount),
      }),
      create: vi.fn(),
    };
    const service = new HostAccountsService(model as unknown as never);

    await expect(service.findDefaultOrCreate()).resolves.toBe(
      hostAccount as HostAccountDocument,
    );
    expect(model.findOne).toHaveBeenCalledWith({ slug: 'default-admin' });
    expect(model.create).not.toHaveBeenCalled();
  });

  it('creates the default host account when it does not exist', async () => {
    const hostAccount = { slug: 'default-admin' };
    const model = {
      findOne: vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(null),
      }),
      create: vi.fn().mockResolvedValue(hostAccount),
    };
    const service = new HostAccountsService(model as unknown as never);

    await expect(service.findDefaultOrCreate()).resolves.toBe(
      hostAccount as HostAccountDocument,
    );
    expect(model.create).toHaveBeenCalledWith({
      name: 'Default Admin',
      email: 'admin@availo.local',
      slug: 'default-admin',
      timezone: 'Europe/Istanbul',
    });
  });
});
