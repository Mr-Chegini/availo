import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

export type BookingLockDocument = HydratedDocument<BookingLock>;

@Schema({ collection: 'booking_locks' })
export class BookingLock {
  @Prop({ required: true })
  scope!: string;

  @Prop({ required: true })
  ownerToken!: string;

  @Prop({ required: true, expires: 0 })
  expiresAt!: Date;
}

export const BookingLockSchema = SchemaFactory.createForClass(BookingLock);
BookingLockSchema.index(
  { scope: 1 },
  { name: 'uniq_booking_locks_scope', unique: true },
);
