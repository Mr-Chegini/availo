import { Controller, Get, Post, Query } from '@nestjs/common';
import { CalendarConnectionsService } from './calendar-connections.service';

const DEFAULT_OWNER_ID = 'default-admin';

@Controller('calendar-connections')
export class CalendarConnectionsController {
  constructor(
    private readonly calendarConnectionsService: CalendarConnectionsService,
  ) {}

  @Get()
  listConnections(@Query('ownerId') ownerId = DEFAULT_OWNER_ID) {
    return this.calendarConnectionsService.listConnections(ownerId);
  }

  @Post('google/start')
  startGoogleConnection(@Query('ownerId') ownerId = DEFAULT_OWNER_ID) {
    return this.calendarConnectionsService.startGoogleConnection(ownerId);
  }

  @Get('google/callback')
  handleGoogleCallback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
  ) {
    return this.calendarConnectionsService.handleGoogleCallback(code, state);
  }
}
