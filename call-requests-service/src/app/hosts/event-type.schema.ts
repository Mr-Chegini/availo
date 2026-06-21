import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument, Types } from 'mongoose';
import { HostAccount } from './host-account.schema';

export type EventTypeDocument = HydratedDocument<EventType>;

export const DEFAULT_EVENT_TYPE_TIMEZONE = 'Europe/Istanbul';
export const DEFAULT_EVENT_TYPE_WORKDAY_START_HOUR = 10;
export const DEFAULT_EVENT_TYPE_WORKDAY_END_HOUR = 18;
export const DEFAULT_EVENT_TYPE_SLOT_INTERVAL_MINUTES = 30;
export const DEFAULT_EVENT_TYPE_MINIMUM_NOTICE_MINUTES = 0;

@Schema({
  timestamps: true,
  collection: 'event_types',
})
export class EventType {
  @Prop({ type: 'ObjectId', ref: HostAccount.name, required: true })
  hostId!: Types.ObjectId;

  @Prop({ required: true, trim: true, lowercase: true })
  slug!: string;

  @Prop({ required: true, trim: true })
  title!: string;

  @Prop({ required: true, min: 1 })
  durationMinutes!: number;

  @Prop({ required: true, default: true })
  isActive!: boolean;

  @Prop({ required: true, default: true })
  requiresApproval!: boolean;

  @Prop({
    required: true,
    trim: true,
    default: DEFAULT_EVENT_TYPE_TIMEZONE,
  })
  availabilityTimezone!: string;

  @Prop({
    required: true,
    min: 0,
    max: 23,
    default: DEFAULT_EVENT_TYPE_WORKDAY_START_HOUR,
  })
  workdayStartHour!: number;

  @Prop({
    required: true,
    min: 1,
    max: 24,
    default: DEFAULT_EVENT_TYPE_WORKDAY_END_HOUR,
  })
  workdayEndHour!: number;

  @Prop({
    required: true,
    min: 1,
    default: DEFAULT_EVENT_TYPE_SLOT_INTERVAL_MINUTES,
  })
  slotIntervalMinutes!: number;

  @Prop({
    required: true,
    min: 0,
    default: DEFAULT_EVENT_TYPE_MINIMUM_NOTICE_MINUTES,
  })
  minimumNoticeMinutes!: number;

  @Prop({ min: 1 })
  maxFutureDays?: number;

  createdAt!: Date;

  updatedAt!: Date;
}

export const EventTypeSchema = SchemaFactory.createForClass(EventType);

EventTypeSchema.index(
  { hostId: 1, slug: 1 },
  {
    name: 'uniq_event_types_host_slug',
    unique: true,
  },
);

EventTypeSchema.index(
  { hostId: 1, isActive: 1 },
  {
    name: 'idx_event_types_host_active',
  },
);
