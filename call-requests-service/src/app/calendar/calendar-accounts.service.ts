import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import {
  CalendarAccount,
  type CalendarAccountDocument,
  type CalendarProviderName,
} from './calendar-account.schema';

export interface UpsertConnectedCalendarAccountInput {
  ownerId: string;
  provider: CalendarProviderName;
  providerAccountId: string;
  primaryCalendarId: string;
  accessToken?: string;
  refreshToken?: string;
  tokenExpiresAt?: Date;
}

export interface UpdateCalendarAccountTokensInput {
  accountId: string;
  accessToken: string;
  refreshToken?: string;
  tokenExpiresAt?: Date;
}

@Injectable()
export class CalendarAccountsService {
  constructor(
    @InjectModel(CalendarAccount.name)
    private readonly calendarAccountModel: Model<CalendarAccountDocument>,
  ) {}

  async findActiveByOwner(ownerId: string): Promise<CalendarAccountDocument[]> {
    return this.calendarAccountModel
      .find({
        ownerId,
        isActive: true,
      })
      .sort({ createdAt: 1 })
      .exec();
  }

  async upsertConnectedAccount(
    input: UpsertConnectedCalendarAccountInput,
  ): Promise<CalendarAccountDocument> {
    return this.calendarAccountModel
      .findOneAndUpdate(
        {
          ownerId: input.ownerId,
          provider: input.provider,
          providerAccountId: input.providerAccountId,
        },
        {
          $set: {
            primaryCalendarId: input.primaryCalendarId,
            accessToken: input.accessToken,
            refreshToken: input.refreshToken,
            tokenExpiresAt: input.tokenExpiresAt,
            isActive: true,
          },
          $setOnInsert: {
            ownerId: input.ownerId,
            provider: input.provider,
            providerAccountId: input.providerAccountId,
          },
        },
        {
          new: true,
          upsert: true,
        },
      )
      .exec();
  }

  async updateTokens(
    input: UpdateCalendarAccountTokensInput,
  ): Promise<CalendarAccountDocument> {
    const calendarAccount = await this.calendarAccountModel
      .findByIdAndUpdate(
        input.accountId,
        {
          $set: {
            accessToken: input.accessToken,
            refreshToken: input.refreshToken,
            tokenExpiresAt: input.tokenExpiresAt,
          },
        },
        {
          new: true,
        },
      )
      .exec();

    if (!calendarAccount) {
      throw new NotFoundException('Calendar account was not found');
    }

    return calendarAccount;
  }
}
