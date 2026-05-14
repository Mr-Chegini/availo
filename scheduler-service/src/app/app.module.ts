import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import * as Joi from 'joi';
import { SchedulerCallsModule } from './scheduler-calls/scheduler-calls.module';
import { ScheduleModule } from '@nestjs/schedule';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
      validationSchema: Joi.object({
        NODE_ENV: Joi.string()
          .valid('development', 'test', 'production')
          .default('development'),

        SCHEDULER_SERVICE_PORT: Joi.number().default(3001),

        MONGODB_URI: Joi.string().required(),

        RABBITMQ_URL: Joi.string().required(),
        RABBITMQ_CALLS_EXCHANGE: Joi.string().default('calls.exchange'),
        RABBITMQ_CALL_APPROVED_SCHEDULER_QUEUE: Joi.string().default(
          'scheduler.call-approved',
        ),
        RABBITMQ_CALL_CANCELED_SCHEDULER_QUEUE: Joi.string().default(
          'scheduler.call-canceled',
        ),
      }),
    }),

    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        uri: configService.getOrThrow<string>('MONGODB_URI'),
      }),
    }),

    SchedulerCallsModule,
    ScheduleModule.forRoot(),
  ],
})
export class AppModule {}
