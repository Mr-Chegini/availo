import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import type { CreateCallRequestDto } from '@org/shared-types';
import { EventTypesService } from '../hosts/event-types.service';
import { HostAccountsService } from '../hosts/host-accounts.service';
import { CallRequestsService } from './call-requests.service';

@Controller('booking-pages/:hostSlug/event-types/:eventTypeSlug/availability')
export class PublicBookingAvailabilityController {
  constructor(
    private readonly hostAccountsService: HostAccountsService,
    private readonly eventTypesService: EventTypesService,
    private readonly callRequestsService: CallRequestsService,
  ) {}

  @Get()
  async getAvailability(
    @Param('hostSlug') hostSlug: string,
    @Param('eventTypeSlug') eventTypeSlug: string,
    @Query('date') date: string,
  ) {
    const host = await this.hostAccountsService.getBySlug(hostSlug);
    const eventType = await this.eventTypesService.getActiveByHostIdAndSlug(
      host._id,
      eventTypeSlug,
    );

    return this.callRequestsService.getAvailabilityForEventType(
      date,
      eventType,
    );
  }

  @Post('bookings')
  async createBooking(
    @Param('hostSlug') hostSlug: string,
    @Param('eventTypeSlug') eventTypeSlug: string,
    @Body() dto: CreateCallRequestDto,
  ) {
    const host = await this.hostAccountsService.getBySlug(hostSlug);
    const eventType = await this.eventTypesService.getActiveByHostIdAndSlug(
      host._id,
      eventTypeSlug,
    );

    return this.callRequestsService.createForEventType(dto, eventType);
  }
}
