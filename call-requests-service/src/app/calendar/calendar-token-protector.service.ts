import { Injectable, NotImplementedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'crypto';

const TOKEN_PROTECTION_PREFIX = 'v1';
const IV_BYTE_LENGTH = 12;
const AUTH_TAG_BYTE_LENGTH = 16;

@Injectable()
export class CalendarTokenProtector {
  constructor(private readonly configService: ConfigService) {}

  protect(value: string): string {
    const iv = randomBytes(IV_BYTE_LENGTH);
    const cipher = createCipheriv('aes-256-gcm', this.getKey(), iv, {
      authTagLength: AUTH_TAG_BYTE_LENGTH,
    });
    const encrypted = Buffer.concat([
      cipher.update(value, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    return [
      TOKEN_PROTECTION_PREFIX,
      iv.toString('base64url'),
      authTag.toString('base64url'),
      encrypted.toString('base64url'),
    ].join(':');
  }

  restore(protectedValue: string): string {
    const [version, encodedIv, encodedAuthTag, encodedEncryptedValue] =
      protectedValue.split(':');

    if (
      version !== TOKEN_PROTECTION_PREFIX ||
      !encodedIv ||
      !encodedAuthTag ||
      !encodedEncryptedValue
    ) {
      throw new Error('Invalid protected calendar token value');
    }

    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.getKey(),
      Buffer.from(encodedIv, 'base64url'),
      {
        authTagLength: AUTH_TAG_BYTE_LENGTH,
      },
    );
    decipher.setAuthTag(Buffer.from(encodedAuthTag, 'base64url'));

    return Buffer.concat([
      decipher.update(Buffer.from(encodedEncryptedValue, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  }

  private getKey(): Buffer {
    const secret = this.configService.get<string>(
      'CALENDAR_TOKEN_ENCRYPTION_SECRET',
    );

    if (!secret) {
      throw new NotImplementedException(
        'Calendar token protection is not configured yet',
      );
    }

    return createHash('sha256').update(secret).digest();
  }
}
