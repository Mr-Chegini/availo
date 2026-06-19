import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';
import {
  getBookingTimeValidationError,
  getWorkingDayBounds,
  ISTANBUL_TIME_ZONE,
  isWeekend,
} from './call-request-booking-rules';

const NOW = DateTime.fromISO('2026-05-14T09:00:00', {
  zone: ISTANBUL_TIME_ZONE,
});

function istanbulDateTime(iso: string): Date {
  return DateTime.fromISO(iso, { zone: ISTANBUL_TIME_ZONE }).toJSDate();
}

describe('call request booking rules', () => {
  it('accepts a future weekday slot inside working hours', () => {
    const error = getBookingTimeValidationError(
      istanbulDateTime('2026-05-15T10:00:00'),
      NOW,
    );

    expect(error).toBeNull();
  });

  it('rejects same-day bookings', () => {
    const error = getBookingTimeValidationError(
      istanbulDateTime('2026-05-14T10:00:00'),
      NOW,
    );

    expect(error).toBe('Same-day bookings are not allowed');
  });

  it('uses minimum notice when provided instead of same-day blocking', () => {
    const error = getBookingTimeValidationError(
      istanbulDateTime('2026-05-14T11:00:00'),
      NOW,
      {
        minimumNoticeMinutes: 60,
      },
    );

    expect(error).toBeNull();
  });

  it('rejects bookings inside the configured minimum notice window', () => {
    const error = getBookingTimeValidationError(
      istanbulDateTime('2026-05-14T09:30:00'),
      NOW,
      {
        minimumNoticeMinutes: 60,
      },
    );

    expect(error).toBe('Bookings require at least 60 minutes notice');
  });

  it('rejects bookings beyond the configured future window', () => {
    const error = getBookingTimeValidationError(
      istanbulDateTime('2026-06-30T10:00:00'),
      NOW,
      {
        minimumNoticeMinutes: 0,
        maxFutureDays: 30,
      },
    );

    expect(error).toBe('Bookings cannot be more than 30 days in advance');
  });

  it('rejects weekend bookings', () => {
    const error = getBookingTimeValidationError(
      istanbulDateTime('2026-05-16T10:00:00'),
      NOW,
    );

    expect(error).toBe('Calls can only be booked Monday to Friday');
  });

  it('rejects times outside working hours', () => {
    const error = getBookingTimeValidationError(
      istanbulDateTime('2026-05-15T09:30:00'),
      NOW,
    );

    expect(error).toBe(
      'Calls can only be booked between 10:00 and 18:00 Istanbul time',
    );
  });

  it('rejects times that are not on a 30-minute boundary', () => {
    const error = getBookingTimeValidationError(
      istanbulDateTime('2026-05-15T10:15:00'),
      NOW,
    );

    expect(error).toBe('Calls must start on a 30-minute slot');
  });

  it('uses the configured slot interval when provided', () => {
    const error = getBookingTimeValidationError(
      istanbulDateTime('2026-05-15T10:30:00'),
      NOW,
      {
        slotIntervalMinutes: 60,
      },
    );

    expect(error).toBe('Calls must start on a 60-minute slot');
  });

  it('rejects times with seconds', () => {
    const error = getBookingTimeValidationError(
      istanbulDateTime('2026-05-15T10:00:01'),
      NOW,
    );

    expect(error).toBe('Call time must not include seconds or milliseconds');
  });

  it('builds Istanbul working day bounds', () => {
    const day = DateTime.fromISO('2026-05-15', {
      zone: ISTANBUL_TIME_ZONE,
    });

    const { startOfWorkingDay, endOfWorkingDay } = getWorkingDayBounds(day);

    expect(startOfWorkingDay.toISO()).toBe('2026-05-15T10:00:00.000+03:00');
    expect(endOfWorkingDay.toISO()).toBe('2026-05-15T18:00:00.000+03:00');
  });

  it('identifies Istanbul weekends', () => {
    const saturday = DateTime.fromISO('2026-05-16', {
      zone: ISTANBUL_TIME_ZONE,
    });

    expect(isWeekend(saturday)).toBe(true);
  });
});
