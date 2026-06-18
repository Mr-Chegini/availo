import { Injectable, NotImplementedException } from '@nestjs/common';
import { CalendarAccountsService } from './calendar-accounts.service';
import type { CalendarProviderName } from './calendar-account.schema';

export interface CalendarConnectionDto {
  id: string;
  provider: CalendarProviderName;
  providerAccountId: string;
  primaryCalendarId: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class CalendarConnectionsService {
  constructor(
    private readonly calendarAccountsService: CalendarAccountsService,
  ) {}

  async listConnections(ownerId: string): Promise<CalendarConnectionDto[]> {
    const accounts =
      await this.calendarAccountsService.findActiveByOwner(ownerId);

    return accounts.map((account) => ({
      id: account.id,
      provider: account.provider,
      providerAccountId: account.providerAccountId,
      primaryCalendarId: account.primaryCalendarId,
      isActive: account.isActive,
      createdAt: account.createdAt.toISOString(),
      updatedAt: account.updatedAt.toISOString(),
    }));
  }

  startGoogleConnection(): never {
    throw new NotImplementedException(
      'Google Calendar connection is not configured yet',
    );
  }
}
