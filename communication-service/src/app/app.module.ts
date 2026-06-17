import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
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

        MONGODB_URI: Joi.string().required(),

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
        RABBITMQ_CALL_REMINDER_QUEUE: Joi.string().default(
          'communication.call-reminder',
        ),

        RABBITMQ_DAILY_DIGEST_QUEUE: Joi.string().default(
          'communication.daily-digest',
        ),

        ADMIN_EMAIL: Joi.string().email().required(),
        EMAIL_PROVIDER: Joi.string().valid('console', 'smtp').default('console'),
        EMAIL_FROM: Joi.when('EMAIL_PROVIDER', {
          is: 'smtp',
          then: Joi.string().email().required(),
          otherwise: Joi.string().email().optional(),
        }),
        SMTP_HOST: Joi.when('EMAIL_PROVIDER', {
          is: 'smtp',
          then: Joi.string().required(),
          otherwise: Joi.string().optional(),
        }),
        SMTP_PORT: Joi.when('EMAIL_PROVIDER', {
          is: 'smtp',
          then: Joi.number().port().required(),
          otherwise: Joi.number().port().optional(),
        }),
        SMTP_SECURE: Joi.boolean().default(false),
        SMTP_USER: Joi.when('EMAIL_PROVIDER', {
          is: 'smtp',
          then: Joi.string().required(),
          otherwise: Joi.string().optional(),
        }),
        SMTP_PASSWORD: Joi.when('EMAIL_PROVIDER', {
          is: 'smtp',
          then: Joi.string().required(),
          otherwise: Joi.string().optional(),
        }),
      }),
    }),

    MongooseModule.forRoot(process.env.MONGODB_URI ?? ''),
    EmailModule,
  ],
})
export class AppModule {}
