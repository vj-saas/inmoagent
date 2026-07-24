import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TenantThrottlerGuard } from '../common/tenant-throttler.guard';
import { PipelineModule } from '../pipeline/pipeline.module';
import { MasterKeyGuard } from './guards/master-key.guard';
import { PersonOrApiKeyGuard } from './guards/person-or-api-key.guard';
import { TenantApiKeyGuard } from './guards/tenant-api-key.guard';
import { AppointmentsAdminController } from './appointments/appointments-admin.controller';
import { AppointmentsAdminService } from './appointments/appointments-admin.service';
import { AdminLeadsController } from './leads/admin-leads.controller';
import { AdminLeadsService } from './leads/admin-leads.service';
import { AdminMetricsController } from './metrics/admin-metrics.controller';
import { MetricsService } from './metrics/metrics.service';
import { AdminPropertiesController } from './properties/admin-properties.controller';
import { CsvImportService } from './properties/csv-import.service';
import { PropertiesAdminService } from './properties/properties-admin.service';
import { AdminTenantsController } from './tenants/admin-tenants.controller';
import { TenantsAdminService } from './tenants/tenants-admin.service';

@Module({
  imports: [PipelineModule, AuthModule],
  controllers: [
    AdminLeadsController,
    AdminTenantsController,
    AdminPropertiesController,
    AdminMetricsController,
    AppointmentsAdminController,
  ],
  providers: [
    TenantApiKeyGuard,
    // Guard compuesto OR (API key | sesión de persona) para leads/metrics/
    // properties. Inyecta TenantApiKeyGuard (local) y PersonSessionGuard/
    // TenantScopeGuard (exportados por AuthModule). Registrado una sola vez.
    PersonOrApiKeyGuard,
    MasterKeyGuard,
    TenantThrottlerGuard,
    TenantsAdminService,
    AdminLeadsService,
    PropertiesAdminService,
    CsvImportService,
    MetricsService,
    AppointmentsAdminService,
  ],
})
export class AdminModule {}
