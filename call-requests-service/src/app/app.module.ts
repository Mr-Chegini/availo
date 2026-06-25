import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import * as Joi from 'joi';
import { CallRequestsModule } from './call-requests/call-requests.module';
import { HealthModule } from './health/health.module';
import { HostsModule } from './hosts/hosts.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
      validationSchema: Joi.object({
        NODE_ENV: Joi.string()
          .valid('development', 'test', 'staging', 'production')
          .default('development'),

        CALL_REQUESTS_SERVICE_PORT: Joi.number().default(3000),

        MONGODB_URI: Joi.string().required(),

        RABBITMQ_URL: Joi.string().required(),
        RABBITMQ_CALLS_EXCHANGE: Joi.string().default('calls.exchange'),

        ADMIN_API_KEY: Joi.when('NODE_ENV', {
          is: Joi.valid('staging', 'production'),
          then: Joi.string().min(16).required(),
          otherwise: Joi.string().default('dev-admin-key'),
        }),

        CALENDAR_TOKEN_ENCRYPTION_SECRET: Joi.string().optional(),

        GOOGLE_CALENDAR_CLIENT_ID: Joi.string().optional(),
        GOOGLE_CALENDAR_CLIENT_SECRET: Joi.string().optional(),
        GOOGLE_CALENDAR_REDIRECT_URI: Joi.string().uri().optional(),
        GOOGLE_CALENDAR_STATE_SECRET: Joi.string().optional(),

        PUBLIC_BOOKING_RATE_LIMIT_WINDOW_SECONDS: Joi.number()
          .integer()
          .min(1)
          .default(60),
        PUBLIC_BOOKING_RATE_LIMIT_STORE: Joi.string()
          .valid('memory', 'redis')
          .default('memory'),
        REDIS_URL: Joi.when('PUBLIC_BOOKING_RATE_LIMIT_STORE', {
          is: 'redis',
          then: Joi.string().uri().required(),
          otherwise: Joi.string().uri().optional(),
        }),
        PUBLIC_BOOKING_RATE_LIMIT_LOOKUP_MAX: Joi.number()
          .integer()
          .min(1)
          .default(120),
        PUBLIC_BOOKING_RATE_LIMIT_AVAILABILITY_MAX: Joi.number()
          .integer()
          .min(1)
          .default(120),
        PUBLIC_BOOKING_RATE_LIMIT_CREATE_MAX: Joi.number()
          .integer()
          .min(1)
          .default(10),
        PUBLIC_BOOKING_RATE_LIMIT_MANAGE_MAX: Joi.number()
          .integer()
          .min(1)
          .default(30),
      }),
    }),

    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        uri: configService.getOrThrow<string>('MONGODB_URI'),
      }),
    }),

    CallRequestsModule,
    HostsModule,
    HealthModule,
  ],
})
export class AppModule {}
