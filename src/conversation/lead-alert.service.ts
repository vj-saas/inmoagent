import { Injectable, Logger } from '@nestjs/common';
import type { Lead, Tenant } from '@prisma/client';
import { MessagingService } from '../messaging/messaging.service';
import { summarizeLeadFilters } from './templates';

const LEAD_ALERT_TEMPLATE = 'lead_alert';

/**
 * Notificación interna al tenant en cada handoff/agendamiento (docs/04-PLAN-FASES.md
 * Fase 5 tarea 4). Es business-initiated → requiere el template `lead_alert`
 * pre-aprobado en el WABA del tenant; por eso el flag `alertsEnabled` (default
 * false) hasta que ese template esté aprobado.
 */
@Injectable()
export class LeadAlertService {
  private readonly logger = new Logger(LeadAlertService.name);

  constructor(private readonly messaging: MessagingService) {}

  async notify(
    tenant: Tenant,
    lead: Lead,
    propertyTitle: string | null,
  ): Promise<void> {
    if (!tenant.alertsEnabled || !tenant.alertPhone) {
      return;
    }

    try {
      await this.messaging.sendTemplate(
        tenant,
        tenant.alertPhone,
        LEAD_ALERT_TEMPLATE,
        [
          lead.name ?? 'Sin nombre',
          lead.phone,
          summarizeLeadFilters(lead),
          propertyTitle ?? 'Sin propiedad puntual',
        ],
      );
    } catch (error: unknown) {
      // Una notificación interna fallida no debe afectar la conversación con el lead.
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        { err: message, tenantId: tenant.id, leadId: lead.id },
        'No se pudo encolar la alerta interna',
      );
    }
  }
}
