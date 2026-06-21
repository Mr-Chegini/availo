import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { CallRequestStatus } from '@org/shared-types';
import type { HydratedDocument } from 'mongoose';
import { ACTIVE_RESERVATION_STATUSES } from './call-request-status-rules';
import { createCancellationToken } from './call-request-tokens';

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
  { cancellationToken: 1 },
  {
    name: 'uniq_call_requests_cancellation_token',
    unique: true,
    sparse: true,
  },
);
CallRequestSchema.index(
  { scheduledAt: 1 },
  {
    name: 'uniq_call_requests_active_scheduled_at',
    unique: true,
    partialFilterExpression: {
      status: { $in: ACTIVE_RESERVATION_STATUSES },
    },
  },
);
CallRequestSchema.pre('validate', function ensureCancellationToken() {
  if (!this.cancellationToken) {
    this.cancellationToken = createCancellationToken();
  }
});
