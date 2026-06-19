import { describe, expect, it } from 'vitest';
import { HostAccount } from './host-account.schema';
import { EventTypeSchema } from './event-type.schema';

describe('EventTypeSchema', () => {
  it('requires event type identity and scheduling fields', () => {
    expect(EventTypeSchema.path('hostId')?.isRequired).toBe(true);
    expect(EventTypeSchema.path('slug')?.isRequired).toBe(true);
    expect(EventTypeSchema.path('title')?.isRequired).toBe(true);
    expect(EventTypeSchema.path('durationMinutes')?.isRequired).toBe(true);
    expect(EventTypeSchema.path('isActive')?.isRequired).toBe(true);
  });

  it('references the host account', () => {
    expect(EventTypeSchema.path('hostId')?.options.ref).toBe(HostAccount.name);
  });

  it('defaults event types to active', () => {
    expect(EventTypeSchema.path('isActive')?.options.default).toBe(true);
  });

  it('requires a positive duration', () => {
    expect(EventTypeSchema.path('durationMinutes')?.options.min).toBe(1);
  });

  it('defines a unique slug index per host', () => {
    expect(EventTypeSchema.indexes()).toContainEqual([
      {
        hostId: 1,
        slug: 1,
      },
      {
        name: 'uniq_event_types_host_slug',
        unique: true,
      },
    ]);
  });

  it('defines active event type lookup index per host', () => {
    expect(EventTypeSchema.indexes()).toContainEqual([
      {
        hostId: 1,
        isActive: 1,
      },
      {
        name: 'idx_event_types_host_active',
      },
    ]);
  });
});
