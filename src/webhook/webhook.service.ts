import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import {
  MessageDirection,
  MessageType,
  Prisma,
  type Tenant,
} from '@prisma/client';
import { LeadsService } from '../leads/leads.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  JOB_PROCESS_MESSAGE,
  QUEUE_INBOUND,
  QUEUE_MEDIA,
} from '../queues/queues.constants';
import type { MessageQueueJob } from '../queues/queues.types';
import { TenantsService } from '../tenants/tenants.service';
import { PushNotificationService } from '../push-notifications/push-notification.service';
import type {
  MetaMessageType,
  MetaWebhookMessage,
  MetaWebhookPayload,
  MetaWebhookStatus,
  MetaWebhookValue,
} from './meta-webhook.types';

const MESSAGE_TYPE_MAP: Partial<Record<MetaMessageType, MessageType>> = {
  text: MessageType.TEXT,
  audio: MessageType.AUDIO,
  image: MessageType.IMAGE,
  document: MessageType.DOCUMENT,
};

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenants: TenantsService,
    private readonly leads: LeadsService,
    private readonly pushNotifications: PushNotificationService,
    @InjectQueue(QUEUE_INBOUND)
    private readonly inboundQueue: Queue<MessageQueueJob>,
    @InjectQueue(QUEUE_MEDIA)
    private readonly mediaQueue: Queue<MessageQueueJob>,
  ) {}

  /**
   * Procesa la notificación de cita agendada por Calendly.
   */
  async handleCalendlyPayload(body: any): Promise<boolean> {
    if (body.event !== 'invitee.created') {
      this.logger.log(`Evento de Calendly ignorado: ${body.event}`);
      return false;
    }

    const invitee = body.payload?.invitee;
    const email = invitee?.email?.toLowerCase()?.trim();
    const phone = invitee?.text_reminder_number || invitee?.phone;

    if (!email && !phone) {
      this.logger.warn('Calendly webhook recibido sin email ni teléfono del destinatario');
      return false;
    }

    // Buscamos un lead que coincida con el email o el teléfono
    const conditions: Prisma.LeadWhereInput[] = [];
    if (email) {
      conditions.push({ fNotes: { contains: email } }); // El email a veces se guarda en fNotes o campos del lead
    }
    if (phone) {
      // Limpiar formato del teléfono (quitar +, espacios, etc) para cruce
      const cleanPhone = phone.replace(/[^0-9]/g, '');
      conditions.push({ phone: { contains: cleanPhone } });
    }

    if (conditions.length === 0) return false;

    const lead = await this.prisma.lead.findFirst({
      where: {
        OR: conditions,
      },
    });

    if (!lead) {
      this.logger.warn(`No se encontró ningún lead que coincida con Calendly email: ${email} o teléfono: ${phone}`);
      return false;
    }

    // Buscamos la última cita en estado PROPOSED para este lead
    const appointment = await this.prisma.appointment.findFirst({
      where: {
        leadId: lead.id,
        status: 'PROPOSED',
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (!appointment) {
      this.logger.warn(`No hay cita propuesta (PROPOSED) pendiente para el lead ${lead.id}`);
      return false;
    }

    const startTime = body.payload?.start_time ? new Date(body.payload.start_time) : new Date();

    // Confirmamos la cita con la fecha y hora seleccionada
    const updatedAppt = await this.prisma.appointment.update({
      where: { id: appointment.id },
      data: {
        status: 'CONFIRMED',
        scheduledAt: startTime,
        notes: `Confirmado vía Calendly por ${invitee?.name || 'Cliente'}`,
      },
    });

    this.logger.log(`Cita ${appointment.id} confirmada automáticamente vía Calendly para el lead ${lead.id}`);

    // Si la cita tiene un usuario asignado (asesor), le notificamos vía push
    if (updatedAppt.assignedUserId) {
      await this.pushNotifications
        .notifyAppointmentAssigned(updatedAppt.tenantId, updatedAppt.assignedUserId, updatedAppt)
        .catch((err) => {
          this.logger.error(`Error enviando push de cita confirmada por Calendly: ${err.message}`);
        });
    }

    return true;
  }

  /** Devuelve `true` si es la primera vez que vemos este wa_message_id. */
  private async recordWebhookEvent(
    waMessageId: string,
    tenantId: string,
  ): Promise<boolean> {
    try {
      await this.prisma.webhookEvent.create({
        data: { waMessageId, tenantId },
      });
      return true;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Procesa el payload completo del webhook. Nunca lanza: cualquier error se
   * loguea y se sigue con el resto, para que el controller pueda responder
   * 200 siempre (salvo firma inválida, que corta antes en el guard).
   */
  async handlePayload(payload: MetaWebhookPayload): Promise<void> {
    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        await this.handleChange(change.value).catch((error: unknown) => {
          this.logger.error(
            { err: error },
            'Error procesando un change del webhook',
          );
        });
      }
    }
  }

  private async handleChange(value: MetaWebhookValue): Promise<void> {
    const phoneNumberId = value?.metadata?.phone_number_id;
    if (!phoneNumberId) {
      this.logger.warn('Webhook sin metadata.phone_number_id, se ignora');
      return;
    }

    const tenant = await this.tenants.findByPhoneNumberId(phoneNumberId);
    if (!tenant) {
      this.logger.warn(
        { phoneNumberId },
        'Webhook de un phone_number_id sin tenant registrado',
      );
      return;
    }

    for (const status of value.statuses ?? []) {
      await this.handleStatus(tenant, status).catch((error: unknown) => {
        this.logger.error(
          { err: error },
          'Error procesando un status del webhook',
        );
      });
    }

    for (const message of value.messages ?? []) {
      await this.handleMessage(tenant, message).catch((error: unknown) => {
        this.logger.error(
          { err: error },
          'Error procesando un mensaje del webhook',
        );
      });
    }
  }

  private async handleMessage(
    tenant: Tenant,
    message: MetaWebhookMessage,
  ): Promise<void> {
    const isNewEvent = await this.recordWebhookEvent(message.id, tenant.id);
    if (!isNewEvent) {
      this.logger.log(
        { waMessageId: message.id },
        'wa_message_id duplicado, se ignora (retry de Meta)',
      );
      return;
    }

    const lead = await this.leads.findOrCreateByPhone(tenant.id, message.from);
    const type = MESSAGE_TYPE_MAP[message.type] ?? MessageType.UNSUPPORTED;
    const { body, mediaId } = this.extractContent(message, type);

    const saved = await this.prisma.message.create({
      data: {
        tenantId: tenant.id,
        leadId: lead.id,
        direction: MessageDirection.IN,
        type,
        waMessageId: message.id,
        body,
        mediaId,
        meta: message as unknown as Prisma.InputJsonValue,
      },
    });

    const queue =
      type === MessageType.AUDIO || type === MessageType.IMAGE
        ? this.mediaQueue
        : this.inboundQueue;
    await queue.add(JOB_PROCESS_MESSAGE, {
      tenantId: tenant.id,
      leadId: lead.id,
      messageId: saved.id,
    });
  }

  private extractContent(
    message: MetaWebhookMessage,
    type: MessageType,
  ): { body: string | null; mediaId: string | null } {
    switch (type) {
      case MessageType.TEXT:
        return { body: message.text?.body ?? null, mediaId: null };
      case MessageType.AUDIO:
        return { body: null, mediaId: message.audio?.id ?? null };
      case MessageType.IMAGE:
        return {
          body: message.image?.caption ?? null,
          mediaId: message.image?.id ?? null,
        };
      case MessageType.DOCUMENT:
        return {
          body: message.document?.caption ?? null,
          mediaId: message.document?.id ?? null,
        };
      default:
        return { body: null, mediaId: null };
    }
  }

  private async handleStatus(
    tenant: Tenant,
    status: MetaWebhookStatus,
  ): Promise<void> {
    const message = await this.prisma.message.findUnique({
      where: { waMessageId: status.id },
    });
    if (!message || message.tenantId !== tenant.id) {
      // Es normal: la mayoría de los statuses corresponden a mensajes OUT que
      // todavía no procesamos, o llegan antes de fases futuras que los persistan.
      return;
    }

    const previousMeta = (message.meta as Record<string, unknown> | null) ?? {};
    await this.prisma.message.update({
      where: { id: message.id },
      data: {
        meta: { ...previousMeta, lastStatus: status } as Prisma.InputJsonValue,
      },
    });
  }

  /** Devuelve `true` si es la primera vez que vemos este wa_message_id. */
  private async recordWebhookEvent(
    waMessageId: string,
    tenantId: string,
  ): Promise<boolean> {
    try {
      await this.prisma.webhookEvent.create({
        data: { waMessageId, tenantId },
      });
      return true;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return false;
      }
      throw error;
    }
  }
}
