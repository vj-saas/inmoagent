import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import type { EnvConfig } from './config/env.schema';

async function bootstrap() {
  // rawBody: true es necesario para validar X-Hub-Signature-256 del webhook de Meta,
  // que se calcula sobre los bytes crudos del body, no sobre el JSON re-serializado.
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
    rawBody: true,
  });
  app.useLogger(app.get(Logger));
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  const config = app.get(ConfigService<EnvConfig, true>);
  const port = config.get('PORT', { infer: true });

  await app.listen(port);
}
bootstrap().catch((error: unknown) => {
  console.error('Error fatal al iniciar la aplicación:', error);
  process.exit(1);
});
