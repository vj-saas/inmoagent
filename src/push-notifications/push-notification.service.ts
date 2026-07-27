import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import * as webpush from 'web-push';

export interface PushNotificationPayload {
  title: string;
  body: string;
  appointmentId: string;
  leadId: string;
}

@Injectable()
export class PushNotificationService {
  private readonly logger = new Logger(PushNotificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    const publicKey = this.configService.get<string>('VAPID_PUBLIC_KEY');
    const privateKey = this.configService.get<string>('VAPID_PRIVATE_KEY');
    const subject = this.configService.get<string>('VAPID_SUBJECT');

    if (publicKey && privateKey && subject) {
      webpush.setVapidDetails(subject, publicKey, privateKey);
    }
  }

  /**
   * AC-6: notifyAppointmentProposed
   * Envia push a todas las personas activas del tenant cuando no hay un asesor asignado.
   */
  async notifyAppointmentProposed(
    tenantId: string,
    appointment: { id: string; leadId: string },
  ): Promise<void> {
    const subscriptions = await this.prisma.pushSubscription.findMany({
      where: {
        tenantId,
        person: {
          active: true,
        },
      },
    });

    const payload: PushNotificationPayload = {
      title: 'Nueva cita propuesta',
      body: 'Hay una nueva cita propuesta por el asistente pendiente de confirmación.',
      appointmentId: appointment.id,
      leadId: appointment.leadId,
    };

    await this.sendToSubscriptions(subscriptions, payload);
  }

  /**
   * AC-7: notifyAppointmentAssigned
   * Envia push únicamente a las suscripciones del asesor asignado.
   */
  async notifyAppointmentAssigned(
    tenantId: string,
    personId: string,
    appointment: { id: string; leadId: string },
  ): Promise<void> {
    const subscriptions = await this.prisma.pushSubscription.findMany({
      where: {
        tenantId,
        personId,
        person: {
          active: true,
        },
      },
    });

    const payload: PushNotificationPayload = {
      title: 'Cita asignada',
      body: 'Se te ha asignado una cita para gestionar con el lead.',
      appointmentId: appointment.id,
      leadId: appointment.leadId,
    };

    await this.sendToSubscriptions(subscriptions, payload);
  }

  private async sendToSubscriptions(
    subscriptions: any[],
    payload: PushNotificationPayload,
  ): Promise<void> {
    const payloadString = JSON.stringify(payload);

    const promises = subscriptions.map(async (sub) => {
      try {
        const pushSubscription = {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth: sub.auth,
          },
        };
        await webpush.sendNotification(pushSubscription, payloadString);
      } catch (error: any) {
        this.logger.error(
          `Error al enviar push a subscriptionId=${sub.id}, personId=${sub.personId}, tenantId=${sub.tenantId}: ${error.message}`,
        );

        // AC-9: Si es 410 Gone (suscripción expirada/inválida), se elimina
        if (error.statusCode === 410) {
          try {
            await this.prisma.pushSubscription.delete({
              where: { id: sub.id },
            });
            this.logger.log(`Suscripción expirada eliminada: subscriptionId=${sub.id}`);
          } catch (deleteError: any) {
            this.logger.error(`Error al eliminar suscripción expirada subscriptionId=${sub.id}: ${deleteError.message}`);
          }
        }
      }
    });

    // Best effort: resolve all in parallel, but handle individually so none of them crash the overall promise.
    await Promise.all(promises);
  }
}
