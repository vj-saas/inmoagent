import { Injectable } from '@nestjs/common';
import { AppointmentStatus, ConversationState } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface MetricsResult {
  range: { from: string; to: string };
  newLeads: number;
  activeConversations: number;
  handoffs: number;
  appointments: { proposed: number; confirmed: number };
}

/** Métricas por rango de fechas (docs/04-PLAN-FASES.md Fase 6, tarea 2). */
@Injectable()
export class MetricsService {
  constructor(private readonly prisma: PrismaService) {}

  async getMetrics(
    tenantId: string,
    from: Date,
    to: Date,
  ): Promise<MetricsResult> {
    const [newLeads, activeConversations, handoffs, proposed, confirmed] =
      await Promise.all([
        this.prisma.lead.count({
          where: { tenantId, createdAt: { gte: from, lte: to } },
        }),
        this.prisma.lead.count({
          where: {
            tenantId,
            state: { not: ConversationState.OPTED_OUT },
            lastMessageAt: { gte: from, lte: to },
          },
        }),
        this.prisma.lead.count({
          where: { tenantId, handoffAt: { gte: from, lte: to } },
        }),
        this.prisma.appointment.count({
          where: {
            tenantId,
            status: AppointmentStatus.PROPOSED,
            createdAt: { gte: from, lte: to },
          },
        }),
        this.prisma.appointment.count({
          where: {
            tenantId,
            status: AppointmentStatus.CONFIRMED,
            updatedAt: { gte: from, lte: to },
          },
        }),
      ]);

    return {
      range: { from: from.toISOString(), to: to.toISOString() },
      newLeads,
      activeConversations,
      handoffs,
      appointments: { proposed, confirmed },
    };
  }
}
