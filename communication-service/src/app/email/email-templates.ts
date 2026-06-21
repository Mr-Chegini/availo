import type {
  CallApprovedEvent,
  CallCanceledEvent,
  CallRejectedEvent,
  CallReminderEvent,
  CallRequestedEvent,
  DailyDigestEvent,
} from '@org/shared-types';
import type { EmailMessage } from './email-sender';

export function buildCallRequestedEmail(
  payload: CallRequestedEvent,
  publicBookingBaseUrl?: string,
): EmailMessage {
  const actionLinks = buildPublicBookingActionLinks(
    payload,
    publicBookingBaseUrl,
  );
  const bodyText = `Your call request for ${payload.scheduledAt} was received and is waiting for admin approval.`;

  return {
    template: 'CALL_REQUESTED',
    to: payload.email,
    subject: 'Your call request was received',
    text: [bodyText, buildPublicBookingActionLinksText(actionLinks)]
      .filter(Boolean)
      .join('\n\n'),
    html: buildEmailHtml({
      title: 'Your call request was received',
      paragraphs: [bodyText],
      links: actionLinks,
    }),
    metadata: { payload },
  };
}

export function buildCallApprovedEmail(
  payload: CallApprovedEvent,
  publicBookingBaseUrl?: string,
): EmailMessage {
  const actionLinks = buildPublicBookingActionLinks(
    payload,
    publicBookingBaseUrl,
  );
  const bodyText = `Your call request for ${payload.scheduledAt} was approved.`;

  return {
    template: 'CALL_APPROVED',
    to: payload.email,
    subject: 'Your call request was approved',
    text: [bodyText, buildPublicBookingActionLinksText(actionLinks)]
      .filter(Boolean)
      .join('\n\n'),
    html: buildEmailHtml({
      title: 'Your call request was approved',
      paragraphs: [bodyText],
      links: actionLinks,
    }),
    metadata: { payload },
  };
}

export function buildCallRejectedEmail(
  payload: CallRejectedEvent,
): EmailMessage {
  return {
    template: 'CALL_REJECTED',
    to: payload.email,
    subject: 'Your call request was rejected',
    text: 'Your request was rejected by the admin. Please try reserving another time.',
    html: buildEmailHtml({
      title: 'Your call request was rejected',
      paragraphs: [
        'Your request was rejected by the admin. Please try reserving another time.',
      ],
    }),
    metadata: { payload },
  };
}

export function buildCallCanceledEmail(
  payload: CallCanceledEvent,
): EmailMessage {
  return {
    template: 'CALL_CANCELED',
    to: payload.email,
    subject: 'Your scheduled call was canceled',
    text: `Your scheduled call for ${payload.scheduledAt} was canceled.`,
    html: buildEmailHtml({
      title: 'Your scheduled call was canceled',
      paragraphs: [
        `Your scheduled call for ${payload.scheduledAt} was canceled.`,
      ],
    }),
    metadata: { payload },
  };
}

export function buildCallReminderEmails(
  payload: CallReminderEvent,
  adminEmail: string,
): EmailMessage[] {
  return [
    {
      template: 'CALL_REMINDER_CUSTOMER',
      to: payload.email,
      subject: 'Reminder: your call is coming up',
      text: `Reminder: your call is scheduled for ${payload.scheduledAt}.`,
      html: buildEmailHtml({
        title: 'Reminder: your call is coming up',
        paragraphs: [
          `Reminder: your call is scheduled for ${payload.scheduledAt}.`,
        ],
      }),
      metadata: { payload },
    },
    {
      template: 'CALL_REMINDER_ADMIN',
      to: adminEmail,
      subject: 'Reminder: scheduled customer call',
      text: `Reminder: call with ${payload.email} / ${payload.phoneNumber} is scheduled for ${payload.scheduledAt}.`,
      html: buildEmailHtml({
        title: 'Reminder: scheduled customer call',
        paragraphs: [
          `Reminder: call with ${payload.email} / ${payload.phoneNumber} is scheduled for ${payload.scheduledAt}.`,
        ],
      }),
      metadata: { payload },
    },
  ];
}

export function buildDailyDigestEmail(
  payload: DailyDigestEvent,
  adminEmail: string,
): EmailMessage {
  const callLines =
    payload.calls.length === 0
      ? 'No scheduled calls for today.'
      : payload.calls
          .map(
            (call, index) =>
              `${index + 1}. ${call.scheduledAt} - ${call.email} - ${
                call.phoneNumber
              }`,
          )
          .join('\n');

  return {
    template: 'DAILY_DIGEST',
    to: adminEmail,
    subject: `Daily call digest - ${payload.date}`,
    text: callLines,
    html: buildEmailHtml({
      title: `Daily call digest - ${payload.date}`,
      paragraphs:
        payload.calls.length === 0
          ? ['No scheduled calls for today.']
          : payload.calls.map(
              (call, index) =>
                `${index + 1}. ${call.scheduledAt} - ${call.email} - ${
                  call.phoneNumber
                }`,
            ),
    }),
    metadata: { payload },
  };
}

interface EmailHtmlOptions {
  title: string;
  paragraphs: string[];
  links?: PublicBookingActionLinks;
}

interface PublicBookingActionLinks {
  manageUrl: string;
  cancelUrl: string;
  rescheduleUrl: string;
}

function buildPublicBookingActionLinks(
  payload: CallRequestedEvent | CallApprovedEvent,
  publicBookingBaseUrl?: string,
): PublicBookingActionLinks | undefined {
  if (!payload.publicBooking || !publicBookingBaseUrl) {
    return undefined;
  }

  const bookingUrl = buildPublicBookingUrl(
    publicBookingBaseUrl,
    payload.publicBooking.hostSlug,
    payload.publicBooking.eventTypeSlug,
    payload.callRequestId,
  );
  const tokenQuery = `token=${encodeURIComponent(
    payload.publicBooking.cancellationToken,
  )}`;

  return {
    manageUrl: `${bookingUrl}?${tokenQuery}`,
    cancelUrl: `${bookingUrl}/cancel?${tokenQuery}`,
    rescheduleUrl: `${bookingUrl}/reschedule?${tokenQuery}`,
  };
}

function buildPublicBookingActionLinksText(
  links?: PublicBookingActionLinks,
): string | undefined {
  if (!links) {
    return undefined;
  }

  return [
    `Manage booking: ${links.manageUrl}`,
    `Cancel booking: ${links.cancelUrl}`,
    `Reschedule booking: ${links.rescheduleUrl}`,
  ].join('\n');
}

function buildEmailHtml({
  title,
  paragraphs,
  links,
}: EmailHtmlOptions): string {
  const paragraphHtml = paragraphs
    .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
    .join('');
  const linksHtml = links
    ? [
        '<ul>',
        buildActionLinkHtml('Manage booking', links.manageUrl),
        buildActionLinkHtml('Cancel booking', links.cancelUrl),
        buildActionLinkHtml('Reschedule booking', links.rescheduleUrl),
        '</ul>',
      ].join('')
    : '';

  return [
    '<!doctype html>',
    '<html>',
    '<body>',
    `<h1>${escapeHtml(title)}</h1>`,
    paragraphHtml,
    linksHtml,
    '</body>',
    '</html>',
  ].join('');
}

function buildActionLinkHtml(label: string, url: string): string {
  return `<li><a href="${escapeHtml(url)}">${escapeHtml(label)}</a></li>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildPublicBookingUrl(
  publicBookingBaseUrl: string,
  hostSlug: string,
  eventTypeSlug: string,
  bookingId: string,
): string {
  const baseUrl = publicBookingBaseUrl.replace(/\/+$/, '');
  const path = [
    'booking-pages',
    hostSlug,
    'event-types',
    eventTypeSlug,
    'availability',
    'bookings',
    bookingId,
  ]
    .map((segment) => encodeURIComponent(segment))
    .join('/');

  return `${baseUrl}/${path}`;
}
