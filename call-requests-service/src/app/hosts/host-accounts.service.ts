import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { HostAccount, type HostAccountDocument } from './host-account.schema';

export const DEFAULT_HOST_SLUG = 'default-admin';

export interface CreateHostAccountInput {
  name: string;
  email: string;
  slug: string;
  timezone: string;
}

const DEFAULT_HOST_INPUT: CreateHostAccountInput = {
  name: 'Default Admin',
  email: 'admin@availo.local',
  slug: DEFAULT_HOST_SLUG,
  timezone: 'Europe/Istanbul',
};

@Injectable()
export class HostAccountsService {
  constructor(
    @InjectModel(HostAccount.name)
    private readonly hostAccountModel: Model<HostAccountDocument>,
  ) {}

  async createHost(
    input: CreateHostAccountInput,
  ): Promise<HostAccountDocument> {
    return this.hostAccountModel.create({
      name: input.name,
      email: input.email,
      slug: input.slug,
      timezone: input.timezone,
    });
  }

  async findById(id: string): Promise<HostAccountDocument | null> {
    return this.hostAccountModel.findById(id).exec();
  }

  async findBySlug(slug: string): Promise<HostAccountDocument | null> {
    return this.hostAccountModel.findOne({ slug }).exec();
  }

  async findDefaultOrCreate(): Promise<HostAccountDocument> {
    const existingHost = await this.findBySlug(DEFAULT_HOST_SLUG);

    if (existingHost) {
      return existingHost;
    }

    try {
      return await this.createHost(DEFAULT_HOST_INPUT);
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        const host = await this.findBySlug(DEFAULT_HOST_SLUG);

        if (host) {
          return host;
        }
      }

      throw error;
    }
  }

  async getById(id: string): Promise<HostAccountDocument> {
    const host = await this.findById(id);

    if (!host) {
      throw new NotFoundException('Host account was not found');
    }

    return host;
  }
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 11000
  );
}
