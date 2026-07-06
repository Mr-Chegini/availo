import {
  BadRequestException,
  Injectable,
  NotImplementedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { createHmac, timingSafeEqual } from 'crypto';

const GOOGLE_OAUTH_AUTHORIZATION_URL =
  'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_CALENDAR_PRIMARY_CALENDAR_URL =
  'https://www.googleapis.com/calendar/v3/users/me/calendarList/primary';

const GOOGLE_CALENDAR_SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.freebusy',
];

interface OAuthStatePayload {
  ownerId: string;
  issuedAt: string;
}

export interface GoogleCalendarTokenResponse {
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
  tokenType: string;
  scope?: string;
}

export interface GoogleCalendarAccountIdentity {
  providerAccountId: string;
  primaryCalendarId: string;
}

interface GoogleOAuthTokenApiResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope?: string;
}

interface GoogleCalendarPrimaryCalendarApiResponse {
  id?: string;
}

@Injectable()
export class GoogleCalendarOAuthService {
  constructor(private readonly configService: ConfigService) {}

  createAuthorizationUrl(ownerId: string): string {
    const clientId = this.configService.get<string>(
      'GOOGLE_CALENDAR_CLIENT_ID',
    );
    const redirectUri = this.configService.get<string>(
      'GOOGLE_CALENDAR_REDIRECT_URI',
    );
    const stateSecret = this.configService.get<string>(
      'GOOGLE_CALENDAR_STATE_SECRET',
    );

    if (!clientId || !redirectUri || !stateSecret) {
      throw new NotImplementedException(
        'Google Calendar OAuth is not configured yet',
      );
    }

    const authorizationUrl = new URL(GOOGLE_OAUTH_AUTHORIZATION_URL);
    authorizationUrl.searchParams.set('client_id', clientId);
    authorizationUrl.searchParams.set('redirect_uri', redirectUri);
    authorizationUrl.searchParams.set('response_type', 'code');
    authorizationUrl.searchParams.set('access_type', 'offline');
    authorizationUrl.searchParams.set('prompt', 'consent');
    authorizationUrl.searchParams.set(
      'scope',
      GOOGLE_CALENDAR_SCOPES.join(' '),
    );
    authorizationUrl.searchParams.set(
      'state',
      this.createSignedState(
        {
          ownerId,
          issuedAt: new Date().toISOString(),
        },
        stateSecret,
      ),
    );

    return authorizationUrl.toString();
  }

  async exchangeAuthorizationCode(
    code: string,
  ): Promise<GoogleCalendarTokenResponse> {
    const clientId = this.configService.get<string>(
      'GOOGLE_CALENDAR_CLIENT_ID',
    );
    const clientSecret = this.configService.get<string>(
      'GOOGLE_CALENDAR_CLIENT_SECRET',
    );
    const redirectUri = this.configService.get<string>(
      'GOOGLE_CALENDAR_REDIRECT_URI',
    );

    if (!clientId || !clientSecret || !redirectUri) {
      throw new NotImplementedException(
        'Google Calendar OAuth is not configured yet',
      );
    }

    const body = new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    });

    const response = await axios.post<GoogleOAuthTokenApiResponse>(
      GOOGLE_OAUTH_TOKEN_URL,
      body,
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      },
    );

    return {
      accessToken: response.data.access_token,
      refreshToken: response.data.refresh_token,
      expiresIn: response.data.expires_in,
      tokenType: response.data.token_type,
      scope: response.data.scope,
    };
  }

  async getPrimaryCalendarIdentity(
    accessToken: string,
  ): Promise<GoogleCalendarAccountIdentity> {
    const response = await axios.get<GoogleCalendarPrimaryCalendarApiResponse>(
      GOOGLE_CALENDAR_PRIMARY_CALENDAR_URL,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );

    if (!response.data.id) {
      throw new BadRequestException(
        'Google Calendar primary calendar id was not returned',
      );
    }

    return {
      providerAccountId: response.data.id,
      primaryCalendarId: response.data.id,
    };
  }

  verifyState(state: string): OAuthStatePayload {
    const stateSecret = this.configService.get<string>(
      'GOOGLE_CALENDAR_STATE_SECRET',
    );

    if (!stateSecret) {
      throw new NotImplementedException(
        'Google Calendar OAuth is not configured yet',
      );
    }

    const [encodedPayload, signature] = state.split('.');

    if (!encodedPayload || !signature) {
      throw new Error('Invalid Google Calendar OAuth state');
    }

    const expectedSignature = this.signState(encodedPayload, stateSecret);
    const providedSignature = Buffer.from(signature, 'base64url');
    const expectedSignatureBuffer = Buffer.from(expectedSignature, 'base64url');

    if (
      providedSignature.length !== expectedSignatureBuffer.length ||
      !timingSafeEqual(providedSignature, expectedSignatureBuffer)
    ) {
      throw new Error('Invalid Google Calendar OAuth state');
    }

    return JSON.parse(
      Buffer.from(encodedPayload, 'base64url').toString('utf8'),
    ) as OAuthStatePayload;
  }

  private createSignedState(
    payload: OAuthStatePayload,
    stateSecret: string,
  ): string {
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
      'base64url',
    );

    return `${encodedPayload}.${this.signState(encodedPayload, stateSecret)}`;
  }

  private signState(encodedPayload: string, stateSecret: string): string {
    return createHmac('sha256', stateSecret)
      .update(encodedPayload)
      .digest('base64url');
  }
}
