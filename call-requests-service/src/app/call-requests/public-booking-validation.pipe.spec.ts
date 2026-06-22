import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import {
  PublicBookingCreateBodyPipe,
  PublicBookingDatePipe,
  PublicBookingIdPipe,
  PublicBookingRescheduleBodyPipe,
  PublicBookingSlugPipe,
  PublicBookingTokenPipe,
} from './public-booking-validation.pipe';

describe('public booking validation pipes', () => {
  it('trims and accepts valid public booking create input', () => {
    const pipe = new PublicBookingCreateBodyPipe();

    expect(
      pipe.transform({
        email: ' user@example.com ',
        phoneNumber: ' +90 555 111 22 33 ',
        scheduledAt: ' 2030-01-01T09:00:00.000Z ',
      }),
    ).toEqual({
      email: 'user@example.com',
      phoneNumber: '+90 555 111 22 33',
      scheduledAt: '2030-01-01T09:00:00.000Z',
    });
  });

  it('rejects invalid public booking create input', () => {
    const pipe = new PublicBookingCreateBodyPipe();

    expect(() =>
      pipe.transform({
        email: 'not-an-email',
        phoneNumber: '+90 555 111 22 33',
        scheduledAt: '2030-01-01T09:00:00.000Z',
      }),
    ).toThrow(BadRequestException);
    expect(() =>
      pipe.transform({
        email: 'user@example.com',
        phoneNumber: '',
        scheduledAt: '2030-01-01T09:00:00.000Z',
      }),
    ).toThrow(BadRequestException);
    expect(() =>
      pipe.transform({
        email: 'user@example.com',
        phoneNumber: '+90 555 111 22 33',
        scheduledAt: 'not-a-date',
      }),
    ).toThrow(BadRequestException);
  });

  it('validates reschedule input', () => {
    const pipe = new PublicBookingRescheduleBodyPipe();

    expect(
      pipe.transform({
        scheduledAt: ' 2030-01-01T09:00:00.000Z ',
      }),
    ).toEqual({
      scheduledAt: '2030-01-01T09:00:00.000Z',
    });
    expect(() => pipe.transform({ scheduledAt: 'not-a-date' })).toThrow(
      BadRequestException,
    );
  });

  it('validates date query input', () => {
    const pipe = new PublicBookingDatePipe();

    expect(pipe.transform('2030-01-01')).toBe('2030-01-01');
    expect(() => pipe.transform('2030-02-31')).toThrow(BadRequestException);
    expect(() => pipe.transform('01-01-2030')).toThrow(BadRequestException);
  });

  it('validates slugs, booking ids, and tokens', () => {
    expect(
      new PublicBookingSlugPipe('hostSlug').transform('default-admin'),
    ).toBe('default-admin');
    expect(new PublicBookingIdPipe().transform('booking_123')).toBe(
      'booking_123',
    );
    expect(new PublicBookingTokenPipe().transform('token-123')).toBe(
      'token-123',
    );

    expect(() =>
      new PublicBookingSlugPipe('hostSlug').transform('Default Admin'),
    ).toThrow(BadRequestException);
    expect(() => new PublicBookingIdPipe().transform('booking/123')).toThrow(
      BadRequestException,
    );
    expect(() => new PublicBookingTokenPipe().transform('token 123')).toThrow(
      BadRequestException,
    );
  });
});
