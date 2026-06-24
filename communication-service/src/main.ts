import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app/app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const configService = app.get(ConfigService);
  const port = configService.getOrThrow<number>('COMMUNICATION_SERVICE_PORT');

  await app.listen(port);

  Logger.log(
    `Communication Service is running on http://localhost:${port}`,
    'Bootstrap',
  );
}

bootstrap();
