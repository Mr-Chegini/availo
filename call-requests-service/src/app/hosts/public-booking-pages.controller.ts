import { Controller, Get, Param } from '@nestjs/common';
import { PublicBookingPagesService } from './public-booking-pages.service';

@Controller('booking-pages')
export class PublicBookingPagesController {
  constructor(
    private readonly publicBookingPagesService: PublicBookingPagesService,
  ) {}

  @Get(':hostSlug')
  getByHostSlug(@Param('hostSlug') hostSlug: string) {
    return this.publicBookingPagesService.getByHostSlug(hostSlug);
  }
}
