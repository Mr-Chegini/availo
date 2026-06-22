import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import type { CreateCallRequestDto } from '@org/shared-types';

interface PublicBookingRescheduleDto {
  scheduledAt: string;
}

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

@Injectable()
export class PublicBookingSlugPipe implements PipeTransform {
  constructor(private readonly fieldName: string) {}

  transform(value: unknown): string {
    const slug = normalizeString(value);

    if (!slug) {
      throw new BadRequestException(`${this.fieldName} is required`);
    }

    if (slug.length > 80 || !slugPattern.test(slug)) {
      throw new BadRequestException(`${this.fieldName} must be a valid slug`);
    }

    return slug;
  }
}

@Injectable()
export class PublicBookingIdPipe implements PipeTransform {
  transform(value: unknown): string {
    const bookingId = normalizeString(value);

    if (!bookingId) {
      throw new BadRequestException('bookingId is required');
    }

    if (bookingId.length > 128 || /[\s/]/.test(bookingId)) {
      throw new BadRequestException('bookingId must be a valid identifier');
    }

    return bookingId;
  }
}

@Injectable()
export class PublicBookingTokenPipe implements PipeTransform {
  transform(value: unknown): string {
    const token = normalizeString(value);

    if (!token) {
      throw new BadRequestException('token is required');
    }

    if (token.length > 256 || /\s/.test(token)) {
      throw new BadRequestException('token must be a valid token');
    }

    return token;
  }
}

@Injectable()
export class PublicBookingDatePipe implements PipeTransform {
  transform(value: unknown): string {
    const date = normalizeString(value);

    if (!date) {
      throw new BadRequestException('date is required');
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new BadRequestException('date must be in YYYY-MM-DD format');
    }

    const parsed = new Date(`${date}T00:00:00.000Z`);

    if (
      Number.isNaN(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== date
    ) {
      throw new BadRequestException('date must be a valid calendar date');
    }

    return date;
  }
}

@Injectable()
export class PublicBookingCreateBodyPipe implements PipeTransform {
  transform(value: unknown): CreateCallRequestDto {
    if (!isRecord(value)) {
      throw new BadRequestException('request body is required');
    }

    const email = normalizeString(value.email);
    const phoneNumber = normalizeString(value.phoneNumber);
    const scheduledAt = validateScheduledAt(value.scheduledAt);

    if (!email || !emailPattern.test(email) || email.length > 254) {
      throw new BadRequestException('email must be a valid email address');
    }

    if (!phoneNumber || phoneNumber.length > 40) {
      throw new BadRequestException('phoneNumber is required');
    }

    return {
      email,
      phoneNumber,
      scheduledAt,
    };
  }
}

@Injectable()
export class PublicBookingRescheduleBodyPipe implements PipeTransform {
  transform(value: unknown): PublicBookingRescheduleDto {
    if (!isRecord(value)) {
      throw new BadRequestException('request body is required');
    }

    return {
      scheduledAt: validateScheduledAt(value.scheduledAt),
    };
  }
}

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function validateScheduledAt(value: unknown): string {
  const scheduledAt = normalizeString(value);

  if (!scheduledAt) {
    throw new BadRequestException('scheduledAt is required');
  }

  const date = new Date(scheduledAt);

  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException('scheduledAt must be a valid date');
  }

  return scheduledAt;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
