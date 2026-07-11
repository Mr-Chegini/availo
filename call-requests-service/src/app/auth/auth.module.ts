import { Module } from '@nestjs/common';
import { AdminAuthController } from './admin-auth.controller';
import { AdminSessionGuard } from './admin-session.guard';
import { AdminSessionService } from './admin-session.service';

@Module({
  controllers: [AdminAuthController],
  providers: [AdminSessionGuard, AdminSessionService],
  exports: [AdminSessionGuard, AdminSessionService],
})
export class AuthModule {}
