export enum CallRequestStatus {
  REQUESTED = 'REQUESTED',
  SCHEDULED = 'SCHEDULED',
  REJECTED = 'REJECTED',
  CALLED = 'CALLED',
  CANCELED = 'CANCELED',
}

export interface CreateCallRequestDto {
  email: string;
  phoneNumber: string;
  scheduledAt: string;
}

export interface CallRequestedEvent {
  callRequestId: string;
  email: string;
  phoneNumber: string;
  scheduledAt: string;
}

export interface AvailabilitySlotDto {
  scheduledAt: string;
  available: boolean;
}

export enum RabbitmqExchange {
  CALLS = 'calls.exchange',
}

export enum RabbitmqRoutingKey {
  CALL_REQUESTED = 'call.requested',
  CALL_APPROVED = 'call.approved',
  CALL_REJECTED = 'call.rejected',
  CALL_CANCELED = 'call.canceled',
  CALL_REMINDER = 'call.reminder',
  DAILY_DIGEST = 'call.daily-digest',
}

export interface CallRequestResponseDto {
  id: string;
  email: string;
  phoneNumber: string;
  scheduledAt: string;
  status: CallRequestStatus;
  adminNote?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CallApprovedEvent {
  callRequestId: string;
  email: string;
  phoneNumber: string;
  scheduledAt: string;
}

export interface CallRejectedEvent {
  callRequestId: string;
  email: string;
}

export interface CallCanceledEvent {
  callRequestId: string;
  email: string;
  scheduledAt: string;
}

export interface CallReminderEvent {
  callRequestId: string;
  email: string;
  phoneNumber: string;
  scheduledAt: string;
}

export interface DailyDigestEvent {
  date: string;
  calls: Array<{
    callRequestId: string;
    email: string;
    phoneNumber: string;
    scheduledAt: string;
  }>;
}
