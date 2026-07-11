import { Module } from '@nestjs/common';
import { AdminAuthController } from './admin-auth.controller';
import { AdminApiKeyGuard } from './admin-api-key.guard';
import { AdminSessionService } from './admin-session.service';

@Module({
  controllers: [AdminAuthController],
  providers: [AdminApiKeyGuard, AdminSessionService],
  exports: [AdminApiKeyGuard, AdminSessionService],
})
export class AuthModule {}
