import { describe, expect, it } from 'vitest';
import { HostAccount } from './host-account.schema';
import {
  DEFAULT_EVENT_TYPE_MINIMUM_NOTICE_MINUTES,
  DEFAULT_EVENT_TYPE_SLOT_INTERVAL_MINUTES,
  DEFAULT_EVENT_TYPE_TIMEZONE,
  DEFAULT_EVENT_TYPE_WORKDAY_END_HOUR,
  DEFAULT_EVENT_TYPE_WORKDAY_START_HOUR,
  EventTypeSchema,
} from './event-type.schema';

describe('EventTypeSchema', () => {
  it('requires event type identity and scheduling fields', () => {
    expect(EventTypeSchema.path('hostId')?.isRequired).toBe(true);
    expect(EventTypeSchema.path('slug')?.isRequired).toBe(true);
    expect(EventTypeSchema.path('title')?.isRequired).toBe(true);
    expect(EventTypeSchema.path('durationMinutes')?.isRequired).toBe(true);
    expect(EventTypeSchema.path('isActive')?.isRequired).toBe(true);
    expect(EventTypeSchema.path('requiresApproval')?.isRequired).toBe(true);
    expect(EventTypeSchema.path('availabilityTimezone')?.isRequired).toBe(true);
    expect(EventTypeSchema.path('workdayStartHour')?.isRequired).toBe(true);
    expect(EventTypeSchema.path('workdayEndHour')?.isRequired).toBe(true);
    expect(EventTypeSchema.path('slotIntervalMinutes')?.isRequired).toBe(true);
    expect(EventTypeSchema.path('minimumNoticeMinutes')?.isRequired).toBe(true);
  });

  it('references the host account', () => {
    expect(EventTypeSchema.path('hostId')?.options.ref).toBe(HostAccount.name);
  });

  it('defaults event types to active', () => {
    expect(EventTypeSchema.path('isActive')?.options.default).toBe(true);
  });

  it('defaults event types to requiring approval', () => {
    expect(EventTypeSchema.path('requiresApproval')?.options.default).toBe(
      true,
    );
  });

  it('requires a positive duration', () => {
    expect(EventTypeSchema.path('durationMinutes')?.options.min).toBe(1);
  });

  it('defaults availability rules to current app behavior', () => {
    expect(EventTypeSchema.path('availabilityTimezone')?.options.default).toBe(
      DEFAULT_EVENT_TYPE_TIMEZONE,
    );
    expect(EventTypeSchema.path('workdayStartHour')?.options.default).toBe(
      DEFAULT_EVENT_TYPE_WORKDAY_START_HOUR,
    );
    expect(EventTypeSchema.path('workdayEndHour')?.options.default).toBe(
      DEFAULT_EVENT_TYPE_WORKDAY_END_HOUR,
    );
    expect(EventTypeSchema.path('slotIntervalMinutes')?.options.default).toBe(
      DEFAULT_EVENT_TYPE_SLOT_INTERVAL_MINUTES,
    );
    expect(EventTypeSchema.path('minimumNoticeMinutes')?.options.default).toBe(
      DEFAULT_EVENT_TYPE_MINIMUM_NOTICE_MINUTES,
    );
  });

  it('validates availability rule bounds', () => {
    expect(EventTypeSchema.path('workdayStartHour')?.options.min).toBe(0);
    expect(EventTypeSchema.path('workdayStartHour')?.options.max).toBe(23);
    expect(EventTypeSchema.path('workdayEndHour')?.options.min).toBe(1);
    expect(EventTypeSchema.path('workdayEndHour')?.options.max).toBe(24);
    expect(EventTypeSchema.path('slotIntervalMinutes')?.options.min).toBe(1);
    expect(EventTypeSchema.path('minimumNoticeMinutes')?.options.min).toBe(0);
    expect(EventTypeSchema.path('maxFutureDays')?.options.min).toBe(1);
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
