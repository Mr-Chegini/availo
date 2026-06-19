import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DefaultHostBootstrapService } from './default-host-bootstrap.service';
import { HostAccount, HostAccountSchema } from './host-account.schema';
import { HostAccountsService } from './host-accounts.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: HostAccount.name,
        schema: HostAccountSchema,
      },
    ]),
  ],
  providers: [HostAccountsService, DefaultHostBootstrapService],
  exports: [HostAccountsService],
})
export class HostsModule {}
