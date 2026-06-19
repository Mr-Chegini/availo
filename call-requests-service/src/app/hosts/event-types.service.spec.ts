import { describe, expect, it, vi } from 'vitest';
import { EventTypesService } from './event-types.service';
import type { HostAccountsService } from './host-accounts.service';
import type { EventTypeDocument } from './event-type.schema';

describe('EventTypesService', () => {
  it('finds the oldest active event type for the default host', async () => {
    const eventType = {
      slug: 'intro-call',
      durationMinutes: 45,
    };
    const query = {
      sort: vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(eventType),
      }),
    };
    const eventTypeModel = {
      findOne: vi.fn().mockReturnValue(query),
    };
    const hostAccountsService = {
      findDefaultOrCreate: vi.fn().mockResolvedValue({ _id: 'host-1' }),
    };
    const service = new EventTypesService(
      eventTypeModel as unknown as never,
      hostAccountsService as unknown as HostAccountsService,
    );

    await expect(service.findDefaultActiveEventType()).resolves.toBe(
      eventType as EventTypeDocument,
    );
    expect(hostAccountsService.findDefaultOrCreate).toHaveBeenCalledOnce();
    expect(eventTypeModel.findOne).toHaveBeenCalledWith({
      hostId: 'host-1',
      isActive: true,
    });
    expect(query.sort).toHaveBeenCalledWith({ createdAt: 1 });
  });
});
