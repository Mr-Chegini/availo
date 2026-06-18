import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import * as Joi from 'joi';
import { CallRequestsModule } from './call-requests/call-requests.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
      validationSchema: Joi.object({
        NODE_ENV: Joi.string()
          .valid('development', 'test', 'production')
          .default('development'),

        CALL_REQUESTS_SERVICE_PORT: Joi.number().default(3000),

        MONGODB_URI: Joi.string().required(),

        RABBITMQ_URL: Joi.string().required(),
        RABBITMQ_CALLS_EXCHANGE: Joi.string().default('calls.exchange'),

        GOOGLE_CALENDAR_CLIENT_ID: Joi.string().optional(),
        GOOGLE_CALENDAR_REDIRECT_URI: Joi.string().uri().optional(),
        GOOGLE_CALENDAR_STATE_SECRET: Joi.string().optional(),
      }),
    }),

    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        uri: configService.getOrThrow<string>('MONGODB_URI'),
      }),
    }),

    CallRequestsModule,
  ],
})
export class AppModule {}
