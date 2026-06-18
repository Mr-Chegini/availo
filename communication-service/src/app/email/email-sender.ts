export const EMAIL_SENDER = Symbol('EMAIL_SENDER');

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  template: string;
  metadata?: Record<string, unknown>;
}

export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}
