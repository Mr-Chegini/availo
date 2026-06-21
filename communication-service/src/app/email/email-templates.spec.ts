import { describe, expect, it } from 'vitest';
import {
  buildCallApprovedEmail,
  buildCallReminderEmails,
  buildCallRequestedEmail,
  buildDailyDigestEmail,
} from './email-templates';

describe('email templates', () => {
  it('builds a call requested email', () => {
    const payload = {
      callRequestId: 'call-1',
      email: 'user@example.com',
      phoneNumber: '+90 555 111 22 33',
      scheduledAt: '2026-05-15T07:00:00.000Z',
    };

    const email = buildCallRequestedEmail(payload);

    expect(email).toMatchObject({
      template: 'CALL_REQUESTED',
      to: 'user@example.com',
      subject: 'Your call request was received',
      text: 'Your call request for 2026-05-15T07:00:00.000Z was received and is waiting for admin approval.',
    });
    expect(email.html).toContain('<h1>Your call request was received</h1>');
    expect(email.html).toContain(
      '<p>Your call request for 2026-05-15T07:00:00.000Z was received and is waiting for admin approval.</p>',
    );
    expect(email.metadata).toEqual({ payload });
  });

  it('builds a call requested email with public booking action links', () => {
    const email = buildCallRequestedEmail(
      {
        callRequestId: 'call-1',
        email: 'user@example.com',
        phoneNumber: '+90 555 111 22 33',
        scheduledAt: '2026-05-15T07:00:00.000Z',
        publicBooking: {
          hostSlug: 'default-admin',
          eventTypeSlug: 'intro-call',
          cancellationToken: 'cancel-token',
        },
      },
      'https://availo.example.com/api/',
    );

    expect(email.text).toContain(
      'Manage booking: https://availo.example.com/api/booking-pages/default-admin/event-types/intro-call/availability/bookings/call-1?token=cancel-token',
    );
    expect(email.text).toContain(
      'Cancel booking: https://availo.example.com/api/booking-pages/default-admin/event-types/intro-call/availability/bookings/call-1/cancel?token=cancel-token',
    );
    expect(email.text).toContain(
      'Reschedule booking: https://availo.example.com/api/booking-pages/default-admin/event-types/intro-call/availability/bookings/call-1/reschedule?token=cancel-token',
    );
    expect(email.html).toContain(
      '<a href="https://availo.example.com/api/booking-pages/default-admin/event-types/intro-call/availability/bookings/call-1?token=cancel-token">Manage booking</a>',
    );
    expect(email.html).toContain(
      '<a href="https://availo.example.com/api/booking-pages/default-admin/event-types/intro-call/availability/bookings/call-1/cancel?token=cancel-token">Cancel booking</a>',
    );
    expect(email.html).toContain(
      '<a href="https://availo.example.com/api/booking-pages/default-admin/event-types/intro-call/availability/bookings/call-1/reschedule?token=cancel-token">Reschedule booking</a>',
    );
  });

  it('builds a call approved email', () => {
    const email = buildCallApprovedEmail({
      callRequestId: 'call-1',
      email: 'user@example.com',
      phoneNumber: '+90 555 111 22 33',
      scheduledAt: '2026-05-15T07:00:00.000Z',
    });

    expect(email.subject).toBe('Your call request was approved');
    expect(email.text).toBe(
      'Your call request for 2026-05-15T07:00:00.000Z was approved.',
    );
    expect(email.html).toContain('<h1>Your call request was approved</h1>');
    expect(email.html).toContain(
      '<p>Your call request for 2026-05-15T07:00:00.000Z was approved.</p>',
    );
  });

  it('builds a call approved email with public booking action links', () => {
    const email = buildCallApprovedEmail(
      {
        callRequestId: 'call-1',
        email: 'user@example.com',
        phoneNumber: '+90 555 111 22 33',
        scheduledAt: '2026-05-15T07:00:00.000Z',
        publicBooking: {
          hostSlug: 'default-admin',
          eventTypeSlug: 'intro-call',
          cancellationToken: 'cancel-token',
        },
      },
      'https://availo.example.com/api',
    );

    expect(email.text).toContain(
      'Manage booking: https://availo.example.com/api/booking-pages/default-admin/event-types/intro-call/availability/bookings/call-1?token=cancel-token',
    );
    expect(email.html).toContain(
      '<a href="https://availo.example.com/api/booking-pages/default-admin/event-types/intro-call/availability/bookings/call-1?token=cancel-token">Manage booking</a>',
    );
  });

  it('escapes public booking action links in HTML emails', () => {
    const email = buildCallRequestedEmail(
      {
        callRequestId: 'call&1',
        email: 'user@example.com',
        phoneNumber: '+90 555 111 22 33',
        scheduledAt: '2026-05-15T07:00:00.000Z',
        publicBooking: {
          hostSlug: 'host & admin',
          eventTypeSlug: 'intro/call',
          cancellationToken: 'cancel&token',
        },
      },
      'https://availo.example.com/api',
    );

    expect(email.text).toContain(
      'https://availo.example.com/api/booking-pages/host%20%26%20admin/event-types/intro%2Fcall/availability/bookings/call%261?token=cancel%26token',
    );
    expect(email.html).toContain(
      'https://availo.example.com/api/booking-pages/host%20%26%20admin/event-types/intro%2Fcall/availability/bookings/call%261?token=cancel%26token',
    );
  });

  it('builds customer and admin reminder emails', () => {
    const emails = buildCallReminderEmails(
      {
        callRequestId: 'call-1',
        email: 'user@example.com',
        phoneNumber: '+90 555 111 22 33',
        scheduledAt: '2026-05-15T07:00:00.000Z',
      },
      'admin@example.com',
    );

    expect(emails).toHaveLength(2);
    expect(emails[0]).toMatchObject({
      template: 'CALL_REMINDER_CUSTOMER',
      to: 'user@example.com',
    });
    expect(emails[1]).toMatchObject({
      template: 'CALL_REMINDER_ADMIN',
      to: 'admin@example.com',
      text: 'Reminder: call with user@example.com / +90 555 111 22 33 is scheduled for 2026-05-15T07:00:00.000Z.',
    });
  });

  it('builds daily digest email with scheduled calls', () => {
    const email = buildDailyDigestEmail(
      {
        date: '2026-05-15',
        calls: [
          {
            callRequestId: 'call-1',
            email: 'one@example.com',
            phoneNumber: '+90 555 111 11 11',
            scheduledAt: '2026-05-15T07:00:00.000Z',
          },
          {
            callRequestId: 'call-2',
            email: 'two@example.com',
            phoneNumber: '+90 555 222 22 22',
            scheduledAt: '2026-05-15T08:00:00.000Z',
          },
        ],
      },
      'admin@example.com',
    );

    expect(email).toMatchObject({
      template: 'DAILY_DIGEST',
      to: 'admin@example.com',
      subject: 'Daily call digest - 2026-05-15',
      text: [
        '1. 2026-05-15T07:00:00.000Z - one@example.com - +90 555 111 11 11',
        '2. 2026-05-15T08:00:00.000Z - two@example.com - +90 555 222 22 22',
      ].join('\n'),
    });
  });

  it('builds an empty daily digest email', () => {
    const email = buildDailyDigestEmail(
      {
        date: '2026-05-15',
        calls: [],
      },
      'admin@example.com',
    );

    expect(email.text).toBe('No scheduled calls for today.');
  });
});
