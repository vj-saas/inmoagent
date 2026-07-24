import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { MasterKeyGuard } from '../admin/guards/master-key.guard';
import type { AuthenticatedPersonRequest } from './authenticated-person-request';
import { BootstrapOwnerDto } from './dto/bootstrap-owner.dto';
import { CreatePersonDto } from './dto/create-person.dto';
import { OwnerRoleGuard } from './guards/owner-role.guard';
import { PersonSessionGuard } from './guards/person-session.guard';
import { TenantScopeGuard } from './guards/tenant-scope.guard';
import { PeopleService } from './people.service';
import type { PersonResponse } from './person-response';
import type { PersonResponseWithTemporaryPassword } from './people.service';

/**
 * Endpoints de gestión de personas de un tenant.
 *
 * - `POST /admin/tenants/:tenantId/people/bootstrap-owner` — protegido SOLO por
 *   `MasterKeyGuard` (operación de onboarding con master key, sin sesión de
 *   persona aún creada). Crea el primer `OWNER` activo del tenant.
 *
 * - Resto de endpoints — protegidos por la cadena completa:
 *   `PersonSessionGuard` (authN) → `TenantScopeGuard` (aislamiento cross-tenant)
 *   → `OwnerRoleGuard` (solo OWNER). El handler usa `request.person.tenantId`
 *   como fuente autoritativa del tenant (nunca el param directamente, aunque ya
 *   coincide gracias a `TenantScopeGuard`).
 */
@Controller('admin/tenants/:tenantId/people')
export class AdminPeopleController {
  constructor(private readonly peopleService: PeopleService) {}

  /**
   * Bootstrap del primer owner de un tenant. Solo accesible con master key (no
   * requiere sesión de persona). Si ya existe un owner activo ⇒ 409. Si el
   * tenant no existe ⇒ 404 (FK violation).
   */
  @Post('bootstrap-owner')
  @HttpCode(201)
  @UseGuards(MasterKeyGuard)
  bootstrapOwner(
    @Param('tenantId') tenantId: string,
    @Body() dto: BootstrapOwnerDto,
  ): Promise<PersonResponse> {
    return this.peopleService.bootstrapOwner(tenantId, dto);
  }

  /**
   * Lista todas las personas del propio tenant (AC-19). Aislamiento garantizado
   * por `TenantScopeGuard` + filtro por `tenantId` de sesión en el servicio.
   */
  @Get()
  @UseGuards(PersonSessionGuard, TenantScopeGuard, OwnerRoleGuard)
  async listPeople(
    @Req() req: AuthenticatedPersonRequest,
  ): Promise<{ people: PersonResponse[] }> {
    const people = await this.peopleService.list(req.person.tenantId);
    return { people };
  }

  /**
   * Lista las personas activas del tenant, apta para poblar un selector de
   * asignación en el panel humano. Accesible a ambos roles (OWNER y AGENT):
   * a diferencia de `listPeople`, NO usa `OwnerRoleGuard`. Tampoco admite
   * `PersonOrApiKeyGuard`: es exclusivamente para el panel humano, no hay
   * caso de uso server-to-server para este endpoint.
   */
  @Get('assignable')
  @UseGuards(PersonSessionGuard, TenantScopeGuard)
  async listAssignablePeople(
    @Req() req: AuthenticatedPersonRequest,
  ): Promise<{ users: Array<{ id: string; email: string; role: string }> }> {
    const users = await this.peopleService.listAssignable(
      req.person.tenantId,
    );
    return { users };
  }

  /**
   * Crea una persona en el tenant de la sesión (AC-17). Si no se provee
   * `password`, genera una temporal y la devuelve una única vez en la respuesta.
   * Email duplicado globalmente ⇒ 409 (AC-18).
   */
  @Post()
  @HttpCode(201)
  @UseGuards(PersonSessionGuard, TenantScopeGuard, OwnerRoleGuard)
  createPerson(
    @Req() req: AuthenticatedPersonRequest,
    @Body() dto: CreatePersonDto,
  ): Promise<PersonResponse | PersonResponseWithTemporaryPassword> {
    return this.peopleService.create(req.person.tenantId, dto);
  }

  /**
   * Desactiva una persona del propio tenant (AC-20). Borra todas sus sesiones en
   * la misma transacción (sin ventana de sesión viva). Si es el último owner
   * activo del tenant ⇒ 409 sin cambios (AC-21). `personId` de otro tenant ⇒
   * 404 (el filtro por `tenantId` de sesión en el servicio lo absorbe).
   */
  @Patch(':personId/deactivate')
  @UseGuards(PersonSessionGuard, TenantScopeGuard, OwnerRoleGuard)
  deactivatePerson(
    @Req() req: AuthenticatedPersonRequest,
    @Param('personId') personId: string,
  ): Promise<PersonResponse> {
    return this.peopleService.deactivate(req.person.tenantId, personId);
  }

  /**
   * Regenera la contraseña de una persona del propio tenant (AC-23). Devuelve
   * la contraseña temporal en claro una única vez. Borra todas las sesiones de
   * esa persona en la misma transacción. `personId` de otro tenant ⇒ 404.
   */
  @Post(':personId/reset-password')
  @HttpCode(200)
  @UseGuards(PersonSessionGuard, TenantScopeGuard, OwnerRoleGuard)
  resetPassword(
    @Req() req: AuthenticatedPersonRequest,
    @Param('personId') personId: string,
  ): Promise<PersonResponseWithTemporaryPassword> {
    return this.peopleService.resetPassword(req.person.tenantId, personId);
  }
}
