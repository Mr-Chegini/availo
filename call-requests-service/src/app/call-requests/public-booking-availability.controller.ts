import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import type {
  CallRequestResponseDto,
  CallRequestStatus,
  CreateCallRequestDto,
} from '@org/shared-types';
import type { EventTypeDocument } from '../hosts/event-type.schema';
import { EventTypesService } from '../hosts/event-types.service';
import { HostAccountsService } from '../hosts/host-accounts.service';
import { CallRequestsService } from './call-requests.service';

interface PublicBookingConfirmationDto {
  bookingId: string;
  email: string;
  phoneNumber: string;
  scheduledAt: string;
  status: CallRequestStatus;
  eventType: {
    slug: string;
    title: string;
    durationMinutes: number;
  };
}

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
  ): Promise<PublicBookingConfirmationDto> {
    const host = await this.hostAccountsService.getBySlug(hostSlug);
    const eventType = await this.eventTypesService.getActiveByHostIdAndSlug(
      host._id,
      eventTypeSlug,
    );
    const booking = await this.callRequestsService.createForEventType(
      dto,
      eventType,
    );

    return toPublicBookingConfirmation(booking, eventType);
  }
}

function toPublicBookingConfirmation(
  booking: CallRequestResponseDto,
  eventType: EventTypeDocument,
): PublicBookingConfirmationDto {
  return {
    bookingId: booking.id,
    email: booking.email,
    phoneNumber: booking.phoneNumber,
    scheduledAt: booking.scheduledAt,
    status: booking.status,
    eventType: {
      slug: eventType.slug,
      title: eventType.title,
      durationMinutes: eventType.durationMinutes,
    },
  };
}
