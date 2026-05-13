import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

export type SchedulerCallDocument = HydratedDocument<SchedulerCall>;

@Schema({
  timestamps: true,
  collection: 'scheduler_calls',
})
export class SchedulerCall {
  @Prop({ required: true, unique: true })
  callRequestId!: string;

  @Prop({ required: true, trim: true, lowercase: true })
  email!: string;

  @Prop({ required: true, trim: true })
  phoneNumber!: string;

  @Prop({ required: true })
  scheduledAt!: Date;

  @Prop({ required: true, default: false })
  reminderSent!: boolean;

  createdAt!: Date;

  updatedAt!: Date;
}

export const SchedulerCallSchema = SchemaFactory.createForClass(SchedulerCall);

SchedulerCallSchema.index(
  { scheduledAt: 1 },
  { name: 'idx_scheduler_calls_scheduled_at' },
);
