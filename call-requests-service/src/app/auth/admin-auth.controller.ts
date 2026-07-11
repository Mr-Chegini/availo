import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import { AdminSessionService } from './admin-session.service';
import type { AdminLoginResult } from './admin-session.service';

@Controller('auth/admin')
export class AdminAuthController {
  constructor(private readonly adminSessionService: AdminSessionService) {}

  @Post('login')
  login(@Body() body: Record<string, unknown>): AdminLoginResult {
    if (typeof body.email !== 'string' || !body.email.trim()) {
      throw new BadRequestException('email is required');
    }

    if (typeof body.password !== 'string' || !body.password) {
      throw new BadRequestException('password is required');
    }

    return this.adminSessionService.login(body.email.trim(), body.password);
  }
}
