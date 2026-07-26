import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { checkUploadsMountPersistence } from './common/uploads-mount-check.util';
import type { EnvConfig } from './config/env.schema';

async function bootstrap() {
  // rawBody: true es necesario para validar X-Hub-Signature-256 del webhook de Meta,
  // que se calcula sobre los bytes crudos del body, no sobre el JSON re-serializado.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    rawBody: true,
  });
  const logger = app.get(Logger);
  app.useLogger(logger);

  const config = app.get(ConfigService<EnvConfig, true>);
  const port = config.get('PORT', { infer: true });
  const corsOrigins = config.get('CORS_ORIGINS', { infer: true });
  const nodeEnv = config.get('NODE_ENV', { infer: true });
  // UPLOADS_DIR puede venir relativo (./uploads): se resuelve contra el cwd una
  // sola vez acá para que serve-static y el chequeo de montaje usen el mismo path.
  const uploadsDir = resolve(config.get('UPLOADS_DIR', { infer: true }));

  // Se crea al arranque a propósito: si el punto de montaje es read-only (o no
  // existe y no se puede crear), queremos fallar acá y no al primer intento de
  // subir una foto. mkdir recursive es idempotente si el directorio ya existe.
  await mkdir(uploadsDir, { recursive: true });
  checkUploadsMountPersistence({ uploadsDir, nodeEnv, logger });

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

  // Fotos de propiedades subidas por el admin, servidas como estáticos.
  // Se registra DESPUÉS de helmet a propósito: el orden de middlewares de
  // Express es el de registro, y si serve-static fuera primero las respuestas
  // de /uploads/ saldrían sin nosniff, sin CSP y sin crossOriginResourcePolicy
  // "cross-origin" (que es justo lo que permite que el frontend, en otro
  // origen, muestre estas imágenes).
  // - index/redirect en false y dotfiles "ignore": nada de listados, de 301 de
  //   directorio ni de servir dotfiles que caigan en el volumen.
  // - immutable + 30d: los nombres de archivo son únicos por subida, nunca se
  //   reescribe el contenido de una URL ya publicada.
  app.useStaticAssets(uploadsDir, {
    prefix: '/uploads/',
    index: false,
    dotfiles: 'ignore',
    redirect: false,
    maxAge: '30d',
    immutable: true,
  });

  await app.listen(port);
}
bootstrap().catch((error: unknown) => {
  console.error('Error fatal al iniciar la aplicación:', error);
  process.exit(1);
});
