import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

export type CalendarProviderName = 'local' | 'google' | 'microsoft' | 'caldav';
export type CalendarAccountDocument = HydratedDocument<CalendarAccount>;

@Schema({
  timestamps: true,
  collection: 'calendar_accounts',
})
export class CalendarAccount {
  @Prop({ required: true, trim: true })
  ownerId!: string;

  @Prop({
    type: String,
    required: true,
    enum: ['local', 'google', 'microsoft', 'caldav'],
  })
  provider!: CalendarProviderName;

  @Prop({ required: true, trim: true })
  providerAccountId!: string;

  @Prop({ required: true, trim: true })
  primaryCalendarId!: string;

  @Prop({ required: true, default: true })
  isActive!: boolean;

  @Prop({ trim: true })
  accessToken?: string;

  @Prop({ trim: true })
  refreshToken?: string;

  @Prop()
  tokenExpiresAt?: Date;

  createdAt!: Date;

  updatedAt!: Date;
}

export const CalendarAccountSchema =
  SchemaFactory.createForClass(CalendarAccount);

CalendarAccountSchema.index(
  { ownerId: 1, provider: 1, providerAccountId: 1 },
  {
    name: 'uniq_calendar_accounts_owner_provider_account',
    unique: true,
  },
);

CalendarAccountSchema.index(
  { ownerId: 1, isActive: 1 },
  {
    name: 'idx_calendar_accounts_owner_active',
  },
);
