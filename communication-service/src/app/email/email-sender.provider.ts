import type { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ConsoleEmailSender } from './console-email-sender.service';
import { EMAIL_SENDER } from './email-sender';
import { SmtpEmailSender } from './smtp-email-sender.service';

export const emailSenderProvider: Provider = {
  provide: EMAIL_SENDER,
  inject: [ConfigService],
  useFactory: (configService: ConfigService) => {
    const provider = configService.get<string>('EMAIL_PROVIDER', 'console');

    if (provider === 'smtp') {
      return new SmtpEmailSender(configService);
    }

    return new ConsoleEmailSender();
  },
};
