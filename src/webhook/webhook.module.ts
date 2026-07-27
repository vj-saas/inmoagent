import { Module } from '@nestjs/common';
import { TenantThrottlerGuard } from '../common/tenant-throttler.guard';
import { LeadsModule } from '../leads/leads.module';
import { QueuesModule } from '../queues/queues.module';
import { TenantsModule } from '../tenants/tenants.module';
import { MetaSignatureGuard } from './meta-signature.guard';
import { WebhookController } from './webhook.controller';
import { WebhookService } from './webhook.service';

import { PushNotificationsModule } from '../push-notifications/push-notifications.module';

@Module({
  imports: [QueuesModule, TenantsModule, LeadsModule, PushNotificationsModule],
  controllers: [WebhookController],
  providers: [WebhookService, MetaSignatureGuard, TenantThrottlerGuard],
})
export class WebhookModule {}
