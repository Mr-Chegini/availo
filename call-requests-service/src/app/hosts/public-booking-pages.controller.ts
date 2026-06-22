import { Controller, Get, Param } from '@nestjs/common';
import { PublicBookingPagesService } from './public-booking-pages.service';
import { PublicBookingSlugPipe } from '../call-requests/public-booking-validation.pipe';
import { PublicBookingRateLimit } from '../rate-limit/public-booking-rate-limit.decorator';

@Controller('booking-pages')
export class PublicBookingPagesController {
  constructor(
    private readonly publicBookingPagesService: PublicBookingPagesService,
  ) {}

  @Get(':hostSlug')
  @PublicBookingRateLimit('lookup')
  getByHostSlug(
    @Param('hostSlug', new PublicBookingSlugPipe('hostSlug')) hostSlug: string,
  ) {
    return this.publicBookingPagesService.getByHostSlug(hostSlug);
  }
}
