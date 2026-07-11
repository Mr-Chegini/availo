import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AdminSessionService } from './admin-session.service';

interface RequestWithHeaders {
  headers: Record<string, string | string[] | undefined>;
}

@Injectable()
export class AdminSessionGuard implements CanActivate {
  constructor(private readonly adminSessionService: AdminSessionService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestWithHeaders>();
    const bearerToken = getBearerToken(request.headers);

    if (!bearerToken) {
      throw new UnauthorizedException('Admin session token is required');
    }

    try {
      this.adminSessionService.verifyAccessToken(bearerToken);

      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }

      throw new UnauthorizedException('Invalid admin session token');
    }
  }
}

function getBearerToken(headers: RequestWithHeaders['headers']): string | null {
  const authorizationHeader = getSingleHeaderValue(headers.authorization);
  const bearerPrefix = 'Bearer ';

  if (!authorizationHeader?.startsWith(bearerPrefix)) {
    return null;
  }

  return authorizationHeader.slice(bearerPrefix.length);
}

function getSingleHeaderValue(
  headerValue: string | string[] | undefined,
): string | null {
  if (Array.isArray(headerValue)) {
    return headerValue[0] ?? null;
  }

  return headerValue ?? null;
}
