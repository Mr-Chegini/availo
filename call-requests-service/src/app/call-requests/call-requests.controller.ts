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
import { AdminApiKeyGuard } from '../auth/admin-api-key.guard';

@Controller('call-requests')
export class CallRequestsController {
  constructor(private readonly callRequestsService: CallRequestsService) {}

  @Post()
  create(@Body(CreateCallRequestBodyPipe) dto: CreateCallRequestDto) {
    return this.callRequestsService.create(dto);
  }

  @Get()
  @UseGuards(AdminApiKeyGuard)
  findAll() {
    return this.callRequestsService.findAll();
  }

  @Get('availability')
  getAvailability(@Query('date') date: string) {
    return this.callRequestsService.getAvailability(date);
  }

  @Patch(':id/approve')
  @UseGuards(AdminApiKeyGuard)
  approve(@Param('id') id: string) {
    return this.callRequestsService.approve(id);
  }

  @Patch(':id/reject')
  @UseGuards(AdminApiKeyGuard)
  reject(@Param('id') id: string) {
    return this.callRequestsService.reject(id);
  }

  @Patch(':id/called')
  @UseGuards(AdminApiKeyGuard)
  markAsCalled(@Param('id') id: string) {
    return this.callRequestsService.markAsCalled(id);
  }

  @Patch(':id/cancel')
  @UseGuards(AdminApiKeyGuard)
  cancel(@Param('id') id: string) {
    return this.callRequestsService.cancel(id);
  }

  @Patch(':id/admin-note')
  @UseGuards(AdminApiKeyGuard)
  updateAdminNote(
    @Param('id') id: string,
    @Body(UpdateAdminNoteBodyPipe) dto: UpdateAdminNoteDto,
  ) {
    return this.callRequestsService.updateAdminNote(id, dto);
  }
}
