import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { CallRequestStatus } from '@org/shared-types';
import type { HydratedDocument, Types } from 'mongoose';
import { createCancellationToken } from './call-request-tokens';
import { EventType } from '../hosts/event-type.schema';
import { HostAccount } from '../hosts/host-account.schema';

export type CallRequestDocument = HydratedDocument<CallRequest>;

@Schema({
  timestamps: true,
  collection: 'call_requests',
})
export class CallRequest {
  @Prop({ required: true, trim: true, lowercase: true })
  email!: string;

  @Prop({ required: true, trim: true })
  phoneNumber!: string;

  @Prop({ required: true })
  scheduledAt!: Date;

  @Prop({ min: 1 })
  durationMinutes?: number;

  @Prop({
    type: String,
    required: true,
    enum: Object.values(CallRequestStatus),
    default: CallRequestStatus.REQUESTED,
  })
  status!: CallRequestStatus;

  @Prop({ trim: true })
  adminNote?: string;

  @Prop({ required: true, trim: true })
  cancellationToken!: string;

  @Prop({ trim: true })
  calendarProviderEventId?: string;

  @Prop({ trim: true })
  meetingLocation?: string;

  @Prop({ type: 'ObjectId', ref: HostAccount.name })
  hostId?: Types.ObjectId;

  @Prop({ type: 'ObjectId', ref: EventType.name })
  eventTypeId?: Types.ObjectId;

  @Prop({ trim: true })
  publicBookingHostId?: string;

  @Prop({ trim: true })
  publicBookingHostSlug?: string;

  @Prop({ trim: true })
  publicBookingEventTypeSlug?: string;

  createdAt!: Date;

  updatedAt!: Date;
}

export const CallRequestSchema = SchemaFactory.createForClass(CallRequest);
CallRequestSchema.index(
  { scheduledAt: 1, status: 1 },
  { name: 'idx_call_requests_scheduled_at_status' },
);
CallRequestSchema.index(
  { hostId: 1, scheduledAt: 1, status: 1 },
  { name: 'idx_call_requests_host_scheduled_at_status' },
);
CallRequestSchema.index(
  { eventTypeId: 1, scheduledAt: 1, status: 1 },
  { name: 'idx_call_requests_event_type_scheduled_at_status' },
);
CallRequestSchema.index(
  { publicBookingHostId: 1, scheduledAt: 1, status: 1 },
  { name: 'idx_call_requests_public_host_scheduled_at_status' },
);
CallRequestSchema.index(
  { cancellationToken: 1 },
  {
    name: 'uniq_call_requests_cancellation_token',
    unique: true,
    sparse: true,
  },
);
CallRequestSchema.pre('validate', function ensureCancellationToken() {
  if (!this.cancellationToken) {
    this.cancellationToken = createCancellationToken();
  }
});
