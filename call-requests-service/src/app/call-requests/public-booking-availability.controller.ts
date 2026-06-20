import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import type {
  CallRequestStatus,
  CreateCallRequestDto,
} from '@org/shared-types';
import type { CallRequestPublicBookingResponse } from './call-requests.service';
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
  cancellationToken: string;
  eventType: {
    slug: string;
    title: string;
    durationMinutes: number;
  };
}

interface PublicBookingRescheduleDto {
  scheduledAt: string;
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

  @Post('bookings/:bookingId/cancel')
  cancelBooking(
    @Param('bookingId') bookingId: string,
    @Query('token') cancellationToken: string,
  ) {
    return this.callRequestsService.cancelWithToken(
      bookingId,
      cancellationToken,
    );
  }

  @Post('bookings/:bookingId/reschedule')
  async rescheduleBooking(
    @Param('hostSlug') hostSlug: string,
    @Param('eventTypeSlug') eventTypeSlug: string,
    @Param('bookingId') bookingId: string,
    @Query('token') cancellationToken: string,
    @Body() dto: PublicBookingRescheduleDto,
  ): Promise<PublicBookingConfirmationDto> {
    const host = await this.hostAccountsService.getBySlug(hostSlug);
    const eventType = await this.eventTypesService.getActiveByHostIdAndSlug(
      host._id,
      eventTypeSlug,
    );
    const booking = await this.callRequestsService.rescheduleWithToken(
      bookingId,
      cancellationToken,
      dto,
      eventType,
    );

    return toPublicBookingConfirmation(booking, eventType);
  }
}

function toPublicBookingConfirmation(
  booking: CallRequestPublicBookingResponse,
  eventType: EventTypeDocument,
): PublicBookingConfirmationDto {
  return {
    bookingId: booking.id,
    email: booking.email,
    phoneNumber: booking.phoneNumber,
    scheduledAt: booking.scheduledAt,
    status: booking.status,
    cancellationToken: booking.cancellationToken,
    eventType: {
      slug: eventType.slug,
      title: eventType.title,
      durationMinutes: eventType.durationMinutes,
    },
  };
}
