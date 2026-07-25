import { Module } from '@nestjs/common';
import { MasterKeyGuard } from '../admin/guards/master-key.guard';
import { AdminPeopleController } from './admin-people.controller';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { LoginRateLimiterService } from './login-rate-limiter.service';
import { OwnerRoleGuard } from './guards/owner-role.guard';
import { PeopleService } from './people.service';
import { PersonSessionGuard } from './guards/person-session.guard';
import { TenantScopeGuard } from './guards/tenant-scope.guard';

/**
 * Módulo de autenticación y gestión de personas del panel. Registra los dos
 * controllers (`AuthController`, `AdminPeopleController`) y todos sus providers.
 * Reutiliza `PrismaModule` y `RedisModule` sin reimportarlos (ya son `@Global()`
 * en `AppModule`). `MasterKeyGuard` se importa desde `AdminModule` para no
 * duplicar su implementación; `ConfigService` queda disponible via
 * `ConfigModule` global.
 */
@Module({
  controllers: [AuthController, AdminPeopleController],
  providers: [
    AuthService,
    PeopleService,
    LoginRateLimiterService,
    PersonSessionGuard,
    TenantScopeGuard,
    OwnerRoleGuard,
    // MasterKeyGuard se provee acá para que NestJS pueda inyectarlo en
    // AdminPeopleController (que lo usa vía @UseGuards). La clase existente en
    // AdminModule no se toca: se registra como provider independiente porque
    // NestJS resuelve providers por módulo, no de forma global.
    MasterKeyGuard,
  ],
  // Se exportan para que AdminModule pueda inyectarlos en PersonOrApiKeyGuard
  // (guard compuesto OR) sin reimplementar su lógica de sesión/scope.
  exports: [PersonSessionGuard, TenantScopeGuard, OwnerRoleGuard],
})
export class AuthModule {}
