import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { EventTypesService } from './event-types.service';

@Injectable()
export class DefaultHostBootstrapService implements OnApplicationBootstrap {
  constructor(private readonly eventTypesService: EventTypesService) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.eventTypesService.findDefaultOrCreate();
  }
}
