import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import type { CreateCallRequestDto } from '@org/shared-types';
import { CallRequestsService } from './call-requests.service';

@Controller('call-requests')
export class CallRequestsController {
  constructor(private readonly callRequestsService: CallRequestsService) {}

  @Post()
  create(@Body() dto: CreateCallRequestDto) {
    return this.callRequestsService.create(dto);
  }

  @Get('availability')
  getAvailability(@Query('date') date: string) {
    return this.callRequestsService.getAvailability(date);
  }
}
