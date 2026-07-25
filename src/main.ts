import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import helmet from 'helmet';
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

  const config = app.get(ConfigService<EnvConfig, true>);
  const port = config.get('PORT', { infer: true });
  const corsOrigins = config.get('CORS_ORIGINS', { infer: true });

  // Esta API es pura (JSON + webhook de Meta), no sirve HTML/JS/CSS propios,
  // por eso la CSP es tan restrictiva como se puede (todo en "none").
  // crossOriginResourcePolicy en "cross-origin" es necesario porque el
  // frontend admin vive en otro origen (ver CORS_ORIGINS) y consume esta API.
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'none'"],
          frameAncestors: ["'none'"],
        },
      },
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  // Habilitar CORS para permitir requests del frontend (incluyendo Authorization header)
  app.enableCors({
    origin: corsOrigins,
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Api-Key', 'X-Master-Key'],
  });

  await app.listen(port);
}
bootstrap().catch((error: unknown) => {
  console.error('Error fatal al iniciar la aplicación:', error);
  process.exit(1);
});
