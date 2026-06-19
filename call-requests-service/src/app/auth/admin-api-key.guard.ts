import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';

interface RequestWithHeaders {
  headers: Record<string, string | string[] | undefined>;
}

@Injectable()
export class AdminApiKeyGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestWithHeaders>();
    const configuredApiKey =
      this.configService.getOrThrow<string>('ADMIN_API_KEY');
    const providedApiKey = getProvidedApiKey(request.headers);

    if (!providedApiKey || !apiKeysMatch(providedApiKey, configuredApiKey)) {
      throw new UnauthorizedException('Admin API key is required');
    }

    return true;
  }
}

function getProvidedApiKey(
  headers: RequestWithHeaders['headers'],
): string | null {
  const apiKeyHeader = getSingleHeaderValue(headers['x-admin-api-key']);

  if (apiKeyHeader) {
    return apiKeyHeader;
  }

  const authorizationHeader = getSingleHeaderValue(headers.authorization);
  const bearerPrefix = 'Bearer ';

  if (authorizationHeader?.startsWith(bearerPrefix)) {
    return authorizationHeader.slice(bearerPrefix.length);
  }

  return null;
}

function getSingleHeaderValue(
  headerValue: string | string[] | undefined,
): string | null {
  if (Array.isArray(headerValue)) {
    return headerValue[0] ?? null;
  }

  return headerValue ?? null;
}

function apiKeysMatch(
  providedApiKey: string,
  configuredApiKey: string,
): boolean {
  const provided = Buffer.from(providedApiKey);
  const configured = Buffer.from(configuredApiKey);

  return (
    provided.length === configured.length &&
    timingSafeEqual(provided, configured)
  );
}
