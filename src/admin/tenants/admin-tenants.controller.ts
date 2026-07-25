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
import type { AuthenticatedPersonRequest } from '../../auth/authenticated-person-request';
import { OwnerRoleGuard } from '../../auth/guards/owner-role.guard';
import { PersonSessionGuard } from '../../auth/guards/person-session.guard';
import { TenantScopeGuard } from '../../auth/guards/tenant-scope.guard';
import { MasterKeyGuard } from '../guards/master-key.guard';
import { TenantApiKeyGuard } from '../guards/tenant-api-key.guard';
import { CreateTenantDto } from './create-tenant.dto';
import type { TenantConfigResponse } from './tenant-config-response';
import { CreatedTenant, TenantsAdminService } from './tenants-admin.service';
import { UpdateTenantConfigDto } from './update-tenant-config.dto';
import { UpdateTokenDto } from './update-token.dto';

@Controller('admin/tenants')
export class AdminTenantsController {
  constructor(private readonly tenantsAdmin: TenantsAdminService) {}

  @Post()
  @UseGuards(MasterKeyGuard)
  create(@Body() dto: CreateTenantDto): Promise<CreatedTenant> {
    return this.tenantsAdmin.create(dto);
  }

  /** Rota el access token de Meta del tenant (requiere su propia API key). */
  @Patch(':tenantId/token')
  @UseGuards(TenantApiKeyGuard)
  @HttpCode(200)
  updateToken(
    @Param('tenantId') tenantId: string,
    @Body() dto: UpdateTokenDto,
  ): Promise<{ rotatedAt: Date }> {
    return this.tenantsAdmin.updateAccessToken(tenantId, dto);
  }

  /**
   * PATCH parcial de configuración del tenant de la sesión (AC-1, AC-2, AC-3,
   * AC-4). Solo OWNER. El handler usa `req.person.tenantId` (sesión) como
   * fuente autoritativa hacia el service, nunca el `:tenantId` de la URL,
   * aunque `TenantScopeGuard` ya garantiza que coinciden.
   */
  @Patch(':tenantId/config')
  @UseGuards(PersonSessionGuard, TenantScopeGuard, OwnerRoleGuard)
  @HttpCode(200)
  updateConfig(
    @Req() req: AuthenticatedPersonRequest,
    @Body() dto: UpdateTenantConfigDto,
  ): Promise<TenantConfigResponse> {
    return this.tenantsAdmin.updateConfig(req.person.tenantId, dto);
  }

  /**
   * Estado de conexión del webhook del tenant de la sesión (AC-9, AC-10,
   * AC-11, AC-12). Accesible a OWNER y AGENT (sin `OwnerRoleGuard`).
   */
  @Get(':tenantId/webhook-status')
  @UseGuards(PersonSessionGuard, TenantScopeGuard)
  webhookStatus(
    @Req() req: AuthenticatedPersonRequest,
  ): Promise<{ connected: boolean; lastEventAt: Date | null; lastMessageAt: Date | null }> {
    return this.tenantsAdmin.webhookStatus(req.person.tenantId);
  }
}
