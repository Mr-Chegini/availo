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