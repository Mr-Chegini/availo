import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument, Types } from 'mongoose';
import { HostAccount } from './host-account.schema';

export type EventTypeDocument = HydratedDocument<EventType>;

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
