import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app/app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors();
  
  const configService = app.get(ConfigService);

  const globalPrefix = 'api';
  app.setGlobalPrefix(globalPrefix);

  const port = configService.getOrThrow<number>(
    'CALL_REQUESTS_SERVICE_PORT',
  );

  await app.listen(port);

  Logger.log(
    `Call Requests Service is running on http://localhost:${port}/${globalPrefix}`,
    'Bootstrap',
  );
}

bootstrap();