import { Module, ValidationPipe } from '@nestjs/common';
import { APP_GUARD, APP_PIPE } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from './config/config.module';
import { RedisModule } from './common/redis.module';
import { PrismaModule } from './prisma/prisma.module';
import { QueuesModule } from './queues/queues.module';
import { HealthModule } from './health/health.module';
import { WebhookModule } from './webhook/webhook.module';
import { MessagingModule } from './messaging/messaging.module';
import { PipelineModule } from './pipeline/pipeline.module';
import { MediaModule } from './media/media.module';
import { AdminModule } from './admin/admin.module';
import { AuthModule } from './auth/auth.module';
import { MaintenanceModule } from './maintenance/maintenance.module';

@Module({
  imports: [
    ConfigModule,
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
        transport:
          process.env.NODE_ENV === 'production'
            ? undefined
            : { target: 'pino-pretty' },
        redact: ['req.headers.authorization'],
      },
    }),
    // Rate limiting global por IP (task Fase 6 #3); el throttling por tenant
    // se suma en rutas puntuales (webhook, admin) vía TenantThrottlerGuard.
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 120 }]),
    RedisModule,
    PrismaModule,
    QueuesModule,
    HealthModule,
    WebhookModule,
    MessagingModule,
    PipelineModule,
    MediaModule,
    AdminModule,
    AuthModule,
    MaintenanceModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({ whitelist: true, transform: true }),
    },
  ],
})
export class AppModule {}
