import { DateTime } from 'luxon';

export const ISTANBUL_TIME_ZONE = 'Europe/Istanbul';
export const WORKDAY_START_HOUR = 10;
export const WORKDAY_END_HOUR = 18;
export const SLOT_INTERVAL_MINUTES = 30;

export interface BookingTimeValidationRules {
  timezone?: string;
  workdayStartHour?: number;
  workdayEndHour?: number;
  slotIntervalMinutes?: number;
  minimumNoticeMinutes?: number;
  maxFutureDays?: number;
}

export function getBookingTimeValidationError(
  scheduledAt: Date,
  nowInIstanbul = DateTime.now().setZone(ISTANBUL_TIME_ZONE),
  rules: BookingTimeValidationRules = {},
): string | null {
  const timezone = rules.timezone ?? ISTANBUL_TIME_ZONE;
  const workdayStartHour = rules.workdayStartHour ?? WORKDAY_START_HOUR;
  const workdayEndHour = rules.workdayEndHour ?? WORKDAY_END_HOUR;
  const slotIntervalMinutes =
    rules.slotIntervalMinutes ?? SLOT_INTERVAL_MINUTES;
  const scheduledInTimezone =
    DateTime.fromJSDate(scheduledAt).setZone(timezone);
  const nowInTimezone = nowInIstanbul.setZone(timezone);

  if (scheduledInTimezone <= nowInTimezone) {
    return 'Call must be scheduled for a future date';
  }

  if (
    rules.minimumNoticeMinutes !== undefined &&
    scheduledInTimezone <
      nowInTimezone.plus({ minutes: rules.minimumNoticeMinutes })
  ) {
    return `Bookings require at least ${rules.minimumNoticeMinutes} minutes notice`;
  }

  if (
    rules.maxFutureDays !== undefined &&
    scheduledInTimezone > nowInTimezone.plus({ days: rules.maxFutureDays })
  ) {
    return `Bookings cannot be more than ${rules.maxFutureDays} days in advance`;
  }

  if (
    rules.minimumNoticeMinutes === undefined &&
    scheduledInTimezone.hasSame(nowInTimezone, 'day')
  ) {
    return 'Same-day bookings are not allowed';
  }

  if (isWeekend(scheduledInTimezone)) {
    return 'Calls can only be booked Monday to Friday';
  }

  if (
    !isInsideWorkingHours(scheduledInTimezone, workdayStartHour, workdayEndHour)
  ) {
    const timezoneLabel =
      timezone === ISTANBUL_TIME_ZONE ? 'Istanbul' : timezone;

    return `Calls can only be booked between ${workdayStartHour}:00 and ${workdayEndHour}:00 ${timezoneLabel} time`;
  }

  if (!isSlotBoundary(scheduledInTimezone, slotIntervalMinutes)) {
    return `Calls must start on a ${slotIntervalMinutes}-minute slot`;
  }

  if (
    scheduledInTimezone.second !== 0 ||
    scheduledInTimezone.millisecond !== 0
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

function isInsideWorkingHours(
  day: DateTime,
  workdayStartHour = WORKDAY_START_HOUR,
  workdayEndHour = WORKDAY_END_HOUR,
): boolean {
  const hour = day.hour;
  const minute = day.minute;

  return (
    hour >= workdayStartHour &&
    (hour < workdayEndHour || (hour === workdayEndHour && minute === 0))
  );
}

function isSlotBoundary(
  day: DateTime,
  slotIntervalMinutes = SLOT_INTERVAL_MINUTES,
): boolean {
  return day.minute % slotIntervalMinutes === 0;
}
