import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import * as Joi from 'joi';
import { EmailModule } from './email/email.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
      validationSchema: Joi.object({
        NODE_ENV: Joi.string()
          .valid('development', 'test', 'production')
          .default('development'),

        COMMUNICATION_SERVICE_PORT: Joi.number().default(3002),

        RABBITMQ_URL: Joi.string().required(),
        RABBITMQ_CALLS_EXCHANGE: Joi.string().default('calls.exchange'),
        RABBITMQ_CALL_REQUESTED_QUEUE: Joi.string().default(
          'communication.call-requested',
        ),
        RABBITMQ_CALL_APPROVED_QUEUE: Joi.string().default(
          'communication.call-approved',
        ),
        RABBITMQ_CALL_REJECTED_QUEUE: Joi.string().default(
          'communication.call-rejected',
        ),
        RABBITMQ_CALL_CANCELED_QUEUE: Joi.string().default(
          'communication.call-canceled',
        ),
      }),
    }),

    EmailModule,
  ],
})
export class AppModule {}
