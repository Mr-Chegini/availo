import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_EVENT_TYPE_SLUG,
  EventTypesService,
} from './event-types.service';
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
      findDefaultOrCreate: vi.fn().mockResolvedValue({
        _id: 'host-1',
        timezone: 'America/New_York',
      }),
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

  it('finds active event types for a host', async () => {
    const eventTypes = [
      {
        slug: 'intro-call',
        durationMinutes: 30,
      },
    ];
    const query = {
      sort: vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(eventTypes),
      }),
    };
    const eventTypeModel = {
      find: vi.fn().mockReturnValue(query),
    };
    const hostAccountsService = {
      findDefaultOrCreate: vi.fn(),
    };
    const service = new EventTypesService(
      eventTypeModel as unknown as never,
      hostAccountsService as unknown as HostAccountsService,
    );

    await expect(service.findActiveByHostId('host-1' as never)).resolves.toBe(
      eventTypes as EventTypeDocument[],
    );
    expect(eventTypeModel.find).toHaveBeenCalledWith({
      hostId: 'host-1',
      isActive: true,
    });
    expect(query.sort).toHaveBeenCalledWith({ createdAt: 1 });
  });

  it('gets an active event type by host id and slug', async () => {
    const eventType = {
      slug: 'intro-call',
    };
    const eventTypeModel = {
      findOne: vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(eventType),
      }),
    };
    const hostAccountsService = {
      findDefaultOrCreate: vi.fn(),
    };
    const service = new EventTypesService(
      eventTypeModel as unknown as never,
      hostAccountsService as unknown as HostAccountsService,
    );

    await expect(
      service.getActiveByHostIdAndSlug('host-1' as never, 'intro-call'),
    ).resolves.toBe(eventType as EventTypeDocument);
    expect(eventTypeModel.findOne).toHaveBeenCalledWith({
      hostId: 'host-1',
      slug: 'intro-call',
      isActive: true,
    });
  });

  it('throws when an active event type does not exist for a host id and slug', async () => {
    const eventTypeModel = {
      findOne: vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(null),
      }),
    };
    const hostAccountsService = {
      findDefaultOrCreate: vi.fn(),
    };
    const service = new EventTypesService(
      eventTypeModel as unknown as never,
      hostAccountsService as unknown as HostAccountsService,
    );

    await expect(
      service.getActiveByHostIdAndSlug('host-1' as never, 'missing'),
    ).rejects.toThrow('Event type was not found');
  });

  it('returns the existing default event type for the default host', async () => {
    const eventType = {
      slug: DEFAULT_EVENT_TYPE_SLUG,
      durationMinutes: 30,
    };
    const eventTypeModel = {
      findOne: vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(eventType),
      }),
      create: vi.fn(),
    };
    const hostAccountsService = {
      findDefaultOrCreate: vi.fn().mockResolvedValue({
        _id: 'host-1',
        timezone: 'America/New_York',
      }),
    };
    const service = new EventTypesService(
      eventTypeModel as unknown as never,
      hostAccountsService as unknown as HostAccountsService,
    );

    await expect(service.findDefaultOrCreate()).resolves.toBe(
      eventType as EventTypeDocument,
    );
    expect(eventTypeModel.findOne).toHaveBeenCalledWith({
      hostId: 'host-1',
      slug: DEFAULT_EVENT_TYPE_SLUG,
    });
    expect(eventTypeModel.create).not.toHaveBeenCalled();
  });

  it('creates the default event type when it does not exist', async () => {
    const eventType = {
      slug: DEFAULT_EVENT_TYPE_SLUG,
      durationMinutes: 30,
    };
    const eventTypeModel = {
      findOne: vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(null),
      }),
      create: vi.fn().mockResolvedValue(eventType),
    };
    const hostAccountsService = {
      findDefaultOrCreate: vi.fn().mockResolvedValue({
        _id: 'host-1',
        timezone: 'America/New_York',
      }),
    };
    const service = new EventTypesService(
      eventTypeModel as unknown as never,
      hostAccountsService as unknown as HostAccountsService,
    );

    await expect(service.findDefaultOrCreate()).resolves.toBe(
      eventType as EventTypeDocument,
    );
    expect(eventTypeModel.create).toHaveBeenCalledWith({
      hostId: 'host-1',
      slug: 'intro-call',
      title: '30 min intro call',
      durationMinutes: 30,
      isActive: true,
      requiresApproval: true,
      availabilityTimezone: 'America/New_York',
      workdayStartHour: 10,
      workdayEndHour: 18,
      slotIntervalMinutes: 30,
      minimumNoticeMinutes: 0,
    });
  });

  it('does not change the timezone for an existing default event type', async () => {
    const eventType = {
      slug: DEFAULT_EVENT_TYPE_SLUG,
      durationMinutes: 30,
      availabilityTimezone: 'Europe/Istanbul',
    };
    const eventTypeModel = {
      findOne: vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(eventType),
      }),
      create: vi.fn(),
    };
    const hostAccountsService = {
      findDefaultOrCreate: vi.fn().mockResolvedValue({
        _id: 'host-1',
        timezone: 'America/New_York',
      }),
    };
    const service = new EventTypesService(
      eventTypeModel as unknown as never,
      hostAccountsService as unknown as HostAccountsService,
    );

    await expect(service.findDefaultOrCreate()).resolves.toBe(
      eventType as EventTypeDocument,
    );
    expect(eventTypeModel.create).not.toHaveBeenCalled();
  });

  it('returns the created default event type after a duplicate key race', async () => {
    const eventType = {
      slug: DEFAULT_EVENT_TYPE_SLUG,
      durationMinutes: 30,
    };
    const eventTypeModel = {
      findOne: vi
        .fn()
        .mockReturnValueOnce({
          exec: vi.fn().mockResolvedValue(null),
        })
        .mockReturnValueOnce({
          exec: vi.fn().mockResolvedValue(eventType),
        }),
      create: vi.fn().mockRejectedValue({ code: 11000 }),
    };
    const hostAccountsService = {
      findDefaultOrCreate: vi.fn().mockResolvedValue({ _id: 'host-1' }),
    };
    const service = new EventTypesService(
      eventTypeModel as unknown as never,
      hostAccountsService as unknown as HostAccountsService,
    );

    await expect(service.findDefaultOrCreate()).resolves.toBe(
      eventType as EventTypeDocument,
    );
    expect(eventTypeModel.findOne).toHaveBeenCalledTimes(2);
  });
});
