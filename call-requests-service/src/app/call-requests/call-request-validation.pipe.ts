import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import type {
  CreateCallRequestDto,
  UpdateAdminNoteDto,
} from '@org/shared-types';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const maxAdminNoteLength = 2_000;

@Injectable()
export class CreateCallRequestBodyPipe implements PipeTransform {
  transform(value: unknown): CreateCallRequestDto {
    if (!isRecord(value)) {
      throw new BadRequestException('request body is required');
    }

    const email = normalizeString(value.email).toLowerCase();
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
export class UpdateAdminNoteBodyPipe implements PipeTransform {
  transform(value: unknown): UpdateAdminNoteDto {
    if (!isRecord(value)) {
      throw new BadRequestException('request body is required');
    }

    if (typeof value.adminNote !== 'string') {
      throw new BadRequestException('adminNote must be a string');
    }

    const adminNote = value.adminNote.trim();

    if (adminNote.length > maxAdminNoteLength) {
      throw new BadRequestException(
        `adminNote must be ${maxAdminNoteLength} characters or fewer`,
      );
    }

    return {
      adminNote,
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
