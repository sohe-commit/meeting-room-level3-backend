import { BadRequestException, ValidationPipe } from '@nestjs/common';
import type { ValidationError } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

/** 입력 검사에서 걸린 첫 번째 안내 문구 하나만 돌려준다. */
function firstMessage(errors: ValidationError[]): string {
  for (const error of errors) {
    const message = error.constraints && Object.values(error.constraints)[0];
    if (message) return message;
    if (error.children?.length) return firstMessage(error.children);
  }
  return '입력값을 다시 확인해 주세요.';
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const origins = (process.env.FRONTEND_URL ?? 'http://localhost:3100')
    .split(',')
    .map((origin) => origin.trim().replace(/\/$/, ''))
    .filter(Boolean);
  app.enableCors({ origin: origins });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      exceptionFactory: (errors) =>
        new BadRequestException(firstMessage(errors)),
    }),
  );

  await app.listen(process.env.PORT ?? 4100);
}
await bootstrap();
