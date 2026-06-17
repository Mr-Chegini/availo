import { DateTime } from 'luxon';

export const ISTANBUL_TIME_ZONE = 'Europe/Istanbul';
export const WORKDAY_START_HOUR = 10;
export const WORKDAY_END_HOUR = 18;
export const SLOT_INTERVAL_MINUTES = 30;

export function getBookingTimeValidationError(
  scheduledAt: Date,
  nowInIstanbul = DateTime.now().setZone(ISTANBUL_TIME_ZONE),
): string | null {
  const scheduledInIstanbul =
    DateTime.fromJSDate(scheduledAt).setZone(ISTANBUL_TIME_ZONE);

  if (scheduledInIstanbul <= nowInIstanbul) {
    return 'Call must be scheduled for a future date';
  }

  if (scheduledInIstanbul.hasSame(nowInIstanbul, 'day')) {
    return 'Same-day bookings are not allowed';
  }

  if (isWeekend(scheduledInIstanbul)) {
    return 'Calls can only be booked Monday to Friday';
  }

  if (!isInsideWorkingHours(scheduledInIstanbul)) {
    return 'Calls can only be booked between 10:00 and 18:00 Istanbul time';
  }

  if (!isSlotBoundary(scheduledInIstanbul)) {
    return 'Calls must start on a 30-minute slot';
  }

  if (
    scheduledInIstanbul.second !== 0 ||
    scheduledInIstanbul.millisecond !== 0
  ) {
    return 'Call time must not include seconds or milliseconds';
  }

  return null;
}

export function getWorkingDayBounds(day: DateTime): {
  startOfWorkingDay: DateTime;
  endOfWorkingDay: DateTime;
} {
  return {
    startOfWorkingDay: day.set({
      hour: WORKDAY_START_HOUR,
      minute: 0,
      second: 0,
      millisecond: 0,
    }),
    endOfWorkingDay: day.set({
      hour: WORKDAY_END_HOUR,
      minute: 0,
      second: 0,
      millisecond: 0,
    }),
  };
}

export function isWeekend(day: DateTime): boolean {
  return day.weekday === 6 || day.weekday === 7;
}

function isInsideWorkingHours(day: DateTime): boolean {
  const hour = day.hour;
  const minute = day.minute;

  return (
    hour >= WORKDAY_START_HOUR &&
    (hour < WORKDAY_END_HOUR ||
      (hour === WORKDAY_END_HOUR && minute === 0))
  );
}

function isSlotBoundary(day: DateTime): boolean {
  return day.minute === 0 || day.minute === SLOT_INTERVAL_MINUTES;
}
