import { Injectable } from '@nestjs/common';
import type {
  CalendarBusySlot,
  CalendarProvider,
  CancelCalendarEventInput,
  CreateCalendarEventInput,
  CreateCalendarEventResult,
  GetBusySlotsInput,
} from './calendar-provider';
import { CalendarAccountsService } from './calendar-accounts.service';
import { CalendarTokenProtector } from './calendar-token-protector.service';

const DEFAULT_OWNER_ID = 'default-admin';

@Injectable()
export class GoogleCalendarProvider implements CalendarProvider {
  constructor(
    private readonly calendarAccountsService: CalendarAccountsService,
    private readonly calendarTokenProtector: CalendarTokenProtector,
  ) {}

  async getBusySlots(_input: GetBusySlotsInput): Promise<CalendarBusySlot[]> {
    await this.getAccessTokenForDefaultOwner();

    return [];
  }

  async createEvent(
    _input: CreateCalendarEventInput,
  ): Promise<CreateCalendarEventResult> {
    await this.getAccessTokenForDefaultOwner();

    return {};
  }

  async cancelEvent(_input: CancelCalendarEventInput): Promise<void> {
    await this.getAccessTokenForDefaultOwner();
  }

  private async getAccessTokenForDefaultOwner(): Promise<string | undefined> {
    const accounts =
      await this.calendarAccountsService.findActiveByOwner(DEFAULT_OWNER_ID);
    const googleAccount = accounts.find(
      (account) => account.provider === 'google' && account.accessToken,
    );

    if (!googleAccount?.accessToken) {
      return undefined;
    }

    return this.calendarTokenProtector.restore(googleAccount.accessToken);
  }
}
