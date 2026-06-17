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
): EmailMessage {
  return {
    template: 'CALL_REQUESTED',
    to: payload.email,
    subject: 'Your call request was received',
    text: `Your call request for ${payload.scheduledAt} was received and is waiting for admin approval.`,
    metadata: { payload },
  };
}

export function buildCallApprovedEmail(
  payload: CallApprovedEvent,
): EmailMessage {
  return {
    template: 'CALL_APPROVED',
    to: payload.email,
    subject: 'Your call request was approved',
    text: `Your call request for ${payload.scheduledAt} was approved.`,
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
      metadata: { payload },
    },
    {
      template: 'CALL_REMINDER_ADMIN',
      to: adminEmail,
      subject: 'Reminder: scheduled customer call',
      text: `Reminder: call with ${payload.email} / ${payload.phoneNumber} is scheduled for ${payload.scheduledAt}.`,
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
    metadata: { payload },
  };
}
