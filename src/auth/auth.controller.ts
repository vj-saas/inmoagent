import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import type { PersonRole } from '@prisma/client';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { PersonSessionGuard } from './guards/person-session.guard';
import type { AuthenticatedPersonRequest } from './authenticated-person-request';
import { Req } from '@nestjs/common';

/**
 * Endpoints públicos de autenticación de personas (login/logout). `POST
 * /auth/login` es público (sin guard de personas); el `ThrottlerGuard` global
 * por IP ya aplica a nivel de `AppModule`. `POST /auth/logout` requiere una
 * sesión válida: si el token es inválido o ya expiró, `PersonSessionGuard`
 * responde 401 antes de llegar al handler.
 */
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * Autentica una persona y devuelve un token de sesión opaco. El token en
   * claro se devuelve UNA sola vez; en DB solo se persiste su sha256. Cualquier
   * fallo (email inexistente, clave incorrecta, cuenta inactiva, tenant
   * inactivo, rate limit) responde con el código apropiado (401 o 429).
   */
  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto): Promise<{ token: string }> {
    return this.authService.login(dto.email, dto.password);
  }

  /**
   * Cierra la sesión activa: borra el registro `Session` cuyo hash coincide con
   * el token del header. Es idempotente — si el token ya no existe no lanza.
   * Responde `{ ok: true }` para que el cliente confirme el logout.
   */
  @Post('logout')
  @HttpCode(200)
  @UseGuards(PersonSessionGuard)
  async logout(@Req() req: AuthenticatedPersonRequest): Promise<{ ok: true }> {
    // El token en claro está en el header; PersonSessionGuard ya lo validó.
    const authHeader = req.headers['authorization'] as string;
    const token = authHeader.slice('Bearer '.length).trim();
    await this.authService.logout(token);
    return { ok: true };
  }

  /**
   * Devuelve la identidad de la persona autenticada según la sesión vigente. No
   * recibe ningún parámetro de tenant en la URL: el tenant se resuelve desde la
   * sesión que `PersonSessionGuard` ya validó y adjuntó a `request.person`, por
   * lo que no hay riesgo de cruce de tenant ni una segunda consulta a la DB.
   * Expone únicamente `id`, `role`, `tenantId` y `email` — nunca el hash de la
   * contraseña ni el token de sesión. Sin sesión válida, el guard responde 401
   * antes de llegar al handler.
   */
  @Get('me')
  @HttpCode(200)
  @UseGuards(PersonSessionGuard)
  me(@Req() req: AuthenticatedPersonRequest): {
    id: string;
    role: PersonRole;
    tenantId: string;
    email: string;
  } {
    const { id, role, tenantId, email } = req.person;
    return { id, role, tenantId, email };
  }
}
