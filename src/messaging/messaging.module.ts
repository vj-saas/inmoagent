import { Module } from '@nestjs/common';
import { LeadsModule } from '../leads/leads.module';
import { QueuesModule } from '../queues/queues.module';
import { TenantsModule } from '../tenants/tenants.module';
import { MessagingService } from './messaging.service';
import { MetaGraphClient } from './meta-graph.client';
import { OutboundProcessor } from './outbound.processor';

@Module({
  imports: [QueuesModule, TenantsModule, LeadsModule],
  providers: [MessagingService, MetaGraphClient, OutboundProcessor],
  exports: [MessagingService],
})
export class MessagingModule {}
