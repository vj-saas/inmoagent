import { Module } from '@nestjs/common';
import { ConversationModule } from '../conversation/conversation.module';
import { MessagingModule } from '../messaging/messaging.module';
import { QueuesModule } from '../queues/queues.module';
import { TenantsModule } from '../tenants/tenants.module';
import { DebounceBufferService } from './debounce-buffer.service';
import { InboundProcessor } from './inbound.processor';

@Module({
  imports: [QueuesModule, TenantsModule, MessagingModule, ConversationModule],
  providers: [DebounceBufferService, InboundProcessor],
  exports: [DebounceBufferService],
})
export class PipelineModule {}
