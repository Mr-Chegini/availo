import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
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
  providers: [HostAccountsService],
  exports: [HostAccountsService],
})
export class HostsModule {}
