import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DefaultHostBootstrapService } from './default-host-bootstrap.service';
import { EventType, EventTypeSchema } from './event-type.schema';
import { EventTypesService } from './event-types.service';
import { HostAccount, HostAccountSchema } from './host-account.schema';
import { HostAccountsService } from './host-accounts.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: HostAccount.name,
        schema: HostAccountSchema,
      },
      {
        name: EventType.name,
        schema: EventTypeSchema,
      },
    ]),
  ],
  providers: [
    HostAccountsService,
    EventTypesService,
    DefaultHostBootstrapService,
  ],
  exports: [HostAccountsService, EventTypesService],
})
export class HostsModule {}
