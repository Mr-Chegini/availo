import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

export type HostAccountDocument = HydratedDocument<HostAccount>;

@Schema({
  timestamps: true,
  collection: 'host_accounts',
})
export class HostAccount {
  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ required: true, trim: true, lowercase: true })
  email!: string;

  @Prop({ required: true, trim: true, lowercase: true })
  slug!: string;

  @Prop({ required: true, trim: true })
  timezone!: string;

  createdAt!: Date;

  updatedAt!: Date;
}

export const HostAccountSchema = SchemaFactory.createForClass(HostAccount);

HostAccountSchema.index(
  { email: 1 },
  {
    name: 'uniq_host_accounts_email',
    unique: true,
  },
);

HostAccountSchema.index(
  { slug: 1 },
  {
    name: 'uniq_host_accounts_slug',
    unique: true,
  },
);
