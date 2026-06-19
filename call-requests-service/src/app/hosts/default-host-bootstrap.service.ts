import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { HostAccountsService } from './host-accounts.service';

@Injectable()
export class DefaultHostBootstrapService implements OnApplicationBootstrap {
  constructor(private readonly hostAccountsService: HostAccountsService) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.hostAccountsService.findDefaultOrCreate();
  }
}
