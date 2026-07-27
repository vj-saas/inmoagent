import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TenantThrottlerGuard } from '../common/tenant-throttler.guard';
import { MessagingModule } from '../messaging/messaging.module';
import { PipelineModule } from '../pipeline/pipeline.module';
import { TenantsModule } from '../tenants/tenants.module';
import { MasterKeyGuard } from './guards/master-key.guard';
import { PersonOrApiKeyGuard } from './guards/person-or-api-key.guard';
import { PersonSessionRequiredGuard } from './guards/person-session-required.guard';
import { TenantApiKeyGuard } from './guards/tenant-api-key.guard';
import { AppointmentsAdminController } from './appointments/appointments-admin.controller';
import { AppointmentsAdminService } from './appointments/appointments-admin.service';
import { AdminLeadMessagingService } from './leads/admin-lead-messaging.service';
import { AdminLeadsController } from './leads/admin-leads.controller';
import { AdminLeadsService } from './leads/admin-leads.service';
import { AdminMetricsController } from './metrics/admin-metrics.controller';
import { MetricsService } from './metrics/metrics.service';
import { AdminPropertiesController } from './properties/admin-properties.controller';
import { CsvImportService } from './properties/csv-import.service';
import { PropertiesAdminService } from './properties/properties-admin.service';
import { PropertyPhotoStorageService } from './properties/property-photo-storage.service';
import { AdminTenantsController } from './tenants/admin-tenants.controller';
import { TenantsAdminService } from './tenants/tenants-admin.service';

import { AdminPushSubscriptionsController } from './push/admin-push-subscriptions.controller';

import { PushNotificationsModule } from '../push-notifications/push-notifications.module';

@Module({
  imports: [PipelineModule, AuthModule, MessagingModule, TenantsModule, PushNotificationsModule],
  controllers: [
    AdminLeadsController,
    AdminTenantsController,
    AdminPropertiesController,
    AdminMetricsController,
    AppointmentsAdminController,
    AdminPushSubscriptionsController,
  ],
  providers: [
    TenantApiKeyGuard,
    // Guard compuesto OR (API key | sesión de persona) para leads/metrics/
    // properties. Inyecta TenantApiKeyGuard (local) y PersonSessionGuard/
    // TenantScopeGuard (exportados por AuthModule). Registrado una sola vez.
    PersonOrApiKeyGuard,
    // Guard marcador a nivel método (T4): solo se aplica al endpoint `send`.
    PersonSessionRequiredGuard,
    MasterKeyGuard,
    TenantThrottlerGuard,
    TenantsAdminService,
    AdminLeadsService,
    AdminLeadMessagingService,
    PropertiesAdminService,
    CsvImportService,
    PropertyPhotoStorageService,
    MetricsService,
    AppointmentsAdminService,
  ],
})
export class AdminModule {}
