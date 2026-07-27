import { Module } from '@nestjs/common';
import { AppointmentsModule } from '../appointments/appointments.module';
import { LlmModule } from '../llm/llm.module';
import { MessagingModule } from '../messaging/messaging.module';
import { PushNotificationsModule } from '../push-notifications/push-notifications.module';
import { PropertiesModule } from '../properties/properties.module';
import { TenantsModule } from '../tenants/tenants.module';
import { ConversationEngine } from './conversation.engine';
import { GuardrailsService } from './guardrails/guardrails.service';
import { GreetingHandler } from './handlers/greeting.handler';
import { QualificationHandler } from './handlers/qualification.handler';
import { SchedulingHandler } from './handlers/scheduling.handler';
import { SearchMatchHandler } from './handlers/search-match.handler';
import { LeadAlertService } from './lead-alert.service';
import { OutputValidatorService } from './output-validator.service';
import { SafeReplyService } from './safe-reply.service';

@Module({
  imports: [
    LlmModule,
    MessagingModule,
    PropertiesModule,
    TenantsModule,
    AppointmentsModule,
    PushNotificationsModule,
  ],
  providers: [
    ConversationEngine,
    GuardrailsService,
    OutputValidatorService,
    SafeReplyService,
    LeadAlertService,
    GreetingHandler,
    QualificationHandler,
    SearchMatchHandler,
    SchedulingHandler,
  ],
  exports: [ConversationEngine],
})
export class ConversationModule {}
