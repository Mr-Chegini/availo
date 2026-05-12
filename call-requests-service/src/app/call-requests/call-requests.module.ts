import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  CallRequest,
  CallRequestSchema,
} from './call-request.schema';
import { CallRequestsController } from './call-requests.controller';
import { CallRequestsService } from './call-requests.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: CallRequest.name,
        schema: CallRequestSchema,
      },
    ]),
  ],
  controllers: [CallRequestsController],
  providers: [CallRequestsService],
})
export class CallRequestsModule {}