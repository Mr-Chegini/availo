import { Injectable, Logger } from '@nestjs/common';
import type { EmailMessage, EmailSender } from './email-sender';

@Injectable()
export class ConsoleEmailSender implements EmailSender {
  private readonly logger = new Logger(ConsoleEmailSender.name);

  async send(message: EmailMessage): Promise<void> {
    this.logger.log({
      template: message.template,
      to: message.to,
      subject: message.subject,
      body: message.text,
      metadata: message.metadata,
    });
  }
}
