import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';

export interface AdminPrincipal {
  sub: string;
  issuedAt: string;
  expiresAt: string;
}

export interface AdminLoginResult {
  accessToken: string;
  tokenType: 'Bearer';
  expiresAt: string;
}

const DEFAULT_SESSION_TTL_SECONDS = 60 * 60 * 8;

@Injectable()
export class AdminSessionService {
  constructor(private readonly configService: ConfigService) {}

  login(email: string, password: string): AdminLoginResult {
    const configuredEmail =
      this.configService.getOrThrow<string>('ADMIN_EMAIL');
    const configuredPassword =
      this.configService.getOrThrow<string>('ADMIN_PASSWORD');

    if (
      !secretValuesMatch(email, configuredEmail) ||
      !secretValuesMatch(password, configuredPassword)
    ) {
      throw new UnauthorizedException('Invalid admin credentials');
    }

    const issuedAt = new Date();
    const expiresAt = new Date(
      issuedAt.getTime() + this.getSessionTtlSeconds() * 1000,
    );
    const accessToken = this.signPayload({
      sub: configuredEmail,
      issuedAt: issuedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
    });

    return {
      accessToken,
      tokenType: 'Bearer',
      expiresAt: expiresAt.toISOString(),
    };
  }

  verifyAccessToken(accessToken: string): AdminPrincipal {
    const [encodedPayload, signature] = accessToken.split('.');

    if (!encodedPayload || !signature) {
      throw new UnauthorizedException('Invalid admin session token');
    }

    const expectedSignature = this.sign(encodedPayload);

    if (!secretValuesMatch(signature, expectedSignature)) {
      throw new UnauthorizedException('Invalid admin session token');
    }

    const payload = this.decodePayload(encodedPayload);
    const issuedAt = new Date(payload.issuedAt);
    const expiresAt = new Date(payload.expiresAt);
    const configuredEmail =
      this.configService.getOrThrow<string>('ADMIN_EMAIL');

    if (
      !payload.sub ||
      !secretValuesMatch(payload.sub, configuredEmail) ||
      Number.isNaN(issuedAt.getTime()) ||
      Number.isNaN(expiresAt.getTime()) ||
      issuedAt > new Date()
    ) {
      throw new UnauthorizedException('Invalid admin session token');
    }

    if (expiresAt <= new Date()) {
      throw new UnauthorizedException('Admin session token expired');
    }

    return payload;
  }

  private signPayload(payload: AdminPrincipal): string {
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
      'base64url',
    );

    return `${encodedPayload}.${this.sign(encodedPayload)}`;
  }

  private sign(encodedPayload: string): string {
    const secret = this.configService.getOrThrow<string>(
      'ADMIN_SESSION_SECRET',
    );

    return createHmac('sha256', secret)
      .update(encodedPayload)
      .digest('base64url');
  }

  private decodePayload(encodedPayload: string): AdminPrincipal {
    try {
      return JSON.parse(
        Buffer.from(encodedPayload, 'base64url').toString('utf8'),
      ) as AdminPrincipal;
    } catch {
      throw new UnauthorizedException('Invalid admin session token');
    }
  }

  private getSessionTtlSeconds(): number {
    return (
      this.configService.get<number>('ADMIN_SESSION_TTL_SECONDS') ??
      DEFAULT_SESSION_TTL_SECONDS
    );
  }
}

function secretValuesMatch(providedValue: string, configuredValue: string) {
  const provided = Buffer.from(providedValue);
  const configured = Buffer.from(configuredValue);

  return (
    provided.length === configured.length &&
    timingSafeEqual(provided, configured)
  );
}
