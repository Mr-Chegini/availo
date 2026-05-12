export enum CallRequestStatus {
  REQUESTED = 'REQUESTED',
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
}
