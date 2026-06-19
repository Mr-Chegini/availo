import { describe, expect, it, vi } from 'vitest';
import { DefaultHostBootstrapService } from './default-host-bootstrap.service';
import type { EventTypesService } from './event-types.service';

describe('DefaultHostBootstrapService', () => {
  it('resolves the default event type during application bootstrap', async () => {
    const eventTypesService = {
      findDefaultOrCreate: vi.fn().mockResolvedValue({ slug: 'intro-call' }),
    };
    const service = new DefaultHostBootstrapService(
      eventTypesService as unknown as EventTypesService,
    );

    await service.onApplicationBootstrap();

    expect(eventTypesService.findDefaultOrCreate).toHaveBeenCalledOnce();
  });
});
