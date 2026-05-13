import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
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

  @Get()
  findAll() {
    return this.callRequestsService.findAll();
  }

  @Patch(':id/approve')
  approve(@Param('id') id: string) {
    return this.callRequestsService.approve(id);
  }

  @Patch(':id/reject')
  reject(@Param('id') id: string) {
    return this.callRequestsService.reject(id);
  }

  @Patch(':id/called')
  markAsCalled(@Param('id') id: string) {
    return this.callRequestsService.markAsCalled(id);
  }

  @Patch(':id/cancel')
  cancel(@Param('id') id: string) {
    return this.callRequestsService.cancel(id);
  }
}
