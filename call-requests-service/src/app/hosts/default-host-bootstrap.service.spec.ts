import { describe, expect, it, vi } from 'vitest';
import { DefaultHostBootstrapService } from './default-host-bootstrap.service';
import type { HostAccountsService } from './host-accounts.service';

describe('DefaultHostBootstrapService', () => {
  it('resolves the default host during application bootstrap', async () => {
    const hostAccountsService = {
      findDefaultOrCreate: vi.fn().mockResolvedValue({ slug: 'default-admin' }),
    };
    const service = new DefaultHostBootstrapService(
      hostAccountsService as unknown as HostAccountsService,
    );

    await service.onApplicationBootstrap();

    expect(hostAccountsService.findDefaultOrCreate).toHaveBeenCalledOnce();
  });
});
