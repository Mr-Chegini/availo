import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';
import type { EmailMessage, EmailSender } from './email-sender';

@Injectable()
export class SmtpEmailSender implements EmailSender {
  private readonly from: string;
  private readonly transporter: Transporter;

  constructor(configService: ConfigService) {
    this.from = configService.getOrThrow<string>('EMAIL_FROM');
    this.transporter = createTransport({
      host: configService.getOrThrow<string>('SMTP_HOST'),
      port: configService.getOrThrow<number>('SMTP_PORT'),
      secure: configService.get<boolean>('SMTP_SECURE', false),
      auth: {
        user: configService.getOrThrow<string>('SMTP_USER'),
        pass: configService.getOrThrow<string>('SMTP_PASSWORD'),
      },
    });
  }

  async send(message: EmailMessage): Promise<void> {
    await this.transporter.sendMail({
      from: this.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
  }
}
