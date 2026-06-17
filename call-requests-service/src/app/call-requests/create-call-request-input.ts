import type { CreateCallRequestDto } from '@org/shared-types';

export interface NormalizedCreateCallRequestInput {
  email: string;
  phoneNumber: string;
  scheduledAt: Date;
}

export function normalizeCreateCallRequestInput(
  dto: CreateCallRequestDto,
): NormalizedCreateCallRequestInput {
  const email = dto.email?.trim().toLowerCase();
  const phoneNumber = dto.phoneNumber?.trim();
  const scheduledAtRaw = dto.scheduledAt?.trim();

  if (!email || !phoneNumber || !scheduledAtRaw) {
    throw new Error('email, phoneNumber and scheduledAt are required');
  }

  if (!isValidEmail(email)) {
    throw new Error('email must be a valid email address');
  }

  const scheduledAt = new Date(scheduledAtRaw);

  if (Number.isNaN(scheduledAt.getTime())) {
    throw new Error('scheduledAt must be a valid date');
  }

  return {
    email,
    phoneNumber,
    scheduledAt,
  };
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
