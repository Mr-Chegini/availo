import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type {
  UpdateAdminNoteDto,
  CreateCallRequestDto,
} from '@org/shared-types';
import { CallRequestsService } from './call-requests.service';
import {
  CreateCallRequestBodyPipe,
  UpdateAdminNoteBodyPipe,
} from './call-request-validation.pipe';
import { AdminSessionGuard } from '../auth/admin-session.guard';

@Controller('call-requests')
export class CallRequestsController {
  constructor(private readonly callRequestsService: CallRequestsService) {}

  @Post()
  create(@Body(CreateCallRequestBodyPipe) dto: CreateCallRequestDto) {
    return this.callRequestsService.create(dto);
  }

  @Get()
  @UseGuards(AdminSessionGuard)
  findAll() {
    return this.callRequestsService.findAll();
  }

  @Get('availability')
  getAvailability(@Query('date') date: string) {
    return this.callRequestsService.getAvailability(date);
  }

  @Patch(':id/approve')
  @UseGuards(AdminSessionGuard)
  approve(@Param('id') id: string) {
    return this.callRequestsService.approve(id);
  }

  @Patch(':id/reject')
  @UseGuards(AdminSessionGuard)
  reject(@Param('id') id: string) {
    return this.callRequestsService.reject(id);
  }

  @Patch(':id/called')
  @UseGuards(AdminSessionGuard)
  markAsCalled(@Param('id') id: string) {
    return this.callRequestsService.markAsCalled(id);
  }

  @Patch(':id/cancel')
  @UseGuards(AdminSessionGuard)
  cancel(@Param('id') id: string) {
    return this.callRequestsService.cancel(id);
  }

  @Patch(':id/admin-note')
  @UseGuards(AdminSessionGuard)
  updateAdminNote(
    @Param('id') id: string,
    @Body(UpdateAdminNoteBodyPipe) dto: UpdateAdminNoteDto,
  ) {
    return this.callRequestsService.updateAdminNote(id, dto);
  }
}
