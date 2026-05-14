import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { CallRequestStatus } from '@org/shared-types';
import type { HydratedDocument } from 'mongoose';

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

  createdAt!: Date;

  updatedAt!: Date;
}

export const CallRequestSchema = SchemaFactory.createForClass(CallRequest);
CallRequestSchema.index(
  { scheduledAt: 1, status: 1 },
  { name: 'idx_call_requests_scheduled_at_status' },
);
