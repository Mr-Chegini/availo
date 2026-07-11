import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { AdminSessionGuard } from '../auth/admin-session.guard';
import { CalendarConnectionsService } from './calendar-connections.service';

@Controller('calendar-connections')
export class CalendarConnectionsController {
  constructor(
    private readonly calendarConnectionsService: CalendarConnectionsService,
  ) {}

  @Get()
  @UseGuards(AdminSessionGuard)
  listConnections(@Query('hostSlug') hostSlug?: string) {
    return this.calendarConnectionsService.listConnections(hostSlug);
  }

  @Post('google/start')
  @UseGuards(AdminSessionGuard)
  startGoogleConnection(@Query('hostSlug') hostSlug?: string) {
    return this.calendarConnectionsService.startGoogleConnection(hostSlug);
  }

  @Get('google/callback')
  handleGoogleCallback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
  ) {
    return this.calendarConnectionsService.handleGoogleCallback(code, state);
  }
}
