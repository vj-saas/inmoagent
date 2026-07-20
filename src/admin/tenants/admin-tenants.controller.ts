import {
  Body,
  Controller,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { MasterKeyGuard } from '../guards/master-key.guard';
import { TenantApiKeyGuard } from '../guards/tenant-api-key.guard';
import { CreateTenantDto } from './create-tenant.dto';
import { CreatedTenant, TenantsAdminService } from './tenants-admin.service';
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
}
