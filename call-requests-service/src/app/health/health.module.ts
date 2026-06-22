import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { MessagingModule } from '../messaging/messaging.module';

@Module({
  imports: [MongooseModule, MessagingModule],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
