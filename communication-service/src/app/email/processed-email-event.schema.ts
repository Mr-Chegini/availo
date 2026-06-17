import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

export type ProcessedEmailEventDocument =
  HydratedDocument<ProcessedEmailEvent>;

@Schema({
  timestamps: true,
  collection: 'processed_email_events',
})
export class ProcessedEmailEvent {
  @Prop({ required: true, unique: true })
  idempotencyKey!: string;

  @Prop({ required: true })
  routingKey!: string;
}

export const ProcessedEmailEventSchema =
  SchemaFactory.createForClass(ProcessedEmailEvent);
