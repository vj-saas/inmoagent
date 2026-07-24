import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConversationState, type Lead, type Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AdminLeadsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Centraliza el patrón `findFirst({ id, tenantId }) -> 404 unificado`, la
   * barrera anti-oráculo de existencia cross-tenant. NUNCA busca por `id` solo
   * y compara `tenantId` después. Acepta un cliente de transacción opcional
   * para reusarse dentro de `$transaction` (ej. opt-out idempotente).
   */
  async findLeadOrThrow(
    tenantId: string,
    leadId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<Lead> {
    const client = tx ?? this.prisma;
    const lead = await client.lead.findFirst({
      where: { id: leadId, tenantId },
    });
    if (!lead) {
      throw new NotFoundException('Lead no encontrado');
    }
    return lead;
  }

  /**
   * Crea una nota humana sobre el lead. `authorPersonId` es `null` cuando el
   * request se autenticó por API key (no hay persona de sesión). El `body` ya
   * viene trimmeado por el DTO; se persiste con `tenantId` para respetar el
   * aislamiento multi-tenant. Devuelve la nota con su autor resuelto.
   */
  async createNote(
    tenantId: string,
    leadId: string,
    authorPersonId: string | null,
    body: string,
  ) {
    await this.findLeadOrThrow(tenantId, leadId);
    return this.prisma.leadNote.create({
      data: { tenantId, leadId, authorPersonId, body: body.trim() },
      include: { author: { select: { id: true, email: true } } },
    });
  }

  /** Lista las notas del lead, más recientes primero, con autor resuelto. */
  async listNotes(tenantId: string, leadId: string) {
    await this.findLeadOrThrow(tenantId, leadId);
    return this.prisma.leadNote.findMany({
      where: { tenantId, leadId },
      orderBy: { createdAt: 'desc' },
      include: { author: { select: { id: true, email: true } } },
    });
  }

  /** Marca el lead como contactado (`contactedAt = now`). Devuelve el lead completo. */
  async markContacted(tenantId: string, leadId: string): Promise<Lead> {
    await this.findLeadOrThrow(tenantId, leadId);
    return this.prisma.lead.update({
      where: { id: leadId },
      data: { contactedAt: new Date() },
    });
  }

  /** Desmarca "contactado" (`contactedAt = null`). Devuelve el lead completo. */
  async markUncontacted(tenantId: string, leadId: string): Promise<Lead> {
    await this.findLeadOrThrow(tenantId, leadId);
    return this.prisma.lead.update({
      where: { id: leadId },
      data: { contactedAt: null },
    });
  }

  /**
   * Opt-out manual (equivalente humano de la regla 6 de CLAUDE.md). Corre en
   * una transacción para resolver la carrera con el bot: se re-lee el lead
   * DENTRO de la tx y, si ya está `OPTED_OUT`, se devuelve sin tocar
   * `optedOutAt` (idempotente — AC-17). No envía mensaje al lead.
   */
  async optOut(tenantId: string, leadId: string): Promise<Lead> {
    return this.prisma.$transaction(async (tx) => {
      await this.findLeadOrThrow(tenantId, leadId, tx);
      // updateMany con `state: { not: OPTED_OUT }` en el WHERE hace que
      // Postgres evalúe la condición y escriba de forma atómica en el mismo
      // statement (a diferencia de leer el estado y actualizar después, que
      // deja una ventana donde el bot podría hacer opt-out entre el read y
      // el write y esta transacción pisaría su `optedOutAt`). Si el lead ya
      // estaba OPTED_OUT (por el bot o por una llamada previa), el
      // updateMany afecta 0 filas y no toca `optedOutAt` — la idempotencia
      // de AC-17 queda garantizada por la DB, no por una lectura previa.
      await tx.lead.updateMany({
        where: { id: leadId, tenantId, state: { not: ConversationState.OPTED_OUT } },
        data: {
          state: ConversationState.OPTED_OUT,
          optedOutAt: new Date(),
        },
      });
      return this.findLeadOrThrow(tenantId, leadId, tx);
    });
  }

  /**
   * PATCH parcial de asignación/próxima acción. `rawBody` es el body CRUDO del
   * request (no el DTO transformado): la presencia de cada campo se detecta con
   * `'campo' in rawBody` para distinguir "no enviado" de "enviado como null".
   * Si `assignedUserId` viene presente y no-null, debe resolver a una `Person`
   * del mismo tenant; si no existe o es de otro tenant → 400 sin tocar el lead.
   */
  async patchAssignment(
    tenantId: string,
    leadId: string,
    rawBody: Record<string, unknown>,
  ): Promise<Lead> {
    await this.findLeadOrThrow(tenantId, leadId);

    const data: Prisma.LeadUpdateInput = {};

    if ('assignedUserId' in rawBody) {
      const assignedUserId = rawBody.assignedUserId as string | null;
      if (assignedUserId !== null) {
        const person = await this.prisma.person.findFirst({
          where: { id: assignedUserId, tenantId },
        });
        if (!person) {
          throw new BadRequestException(
            'El usuario asignado no existe o pertenece a otro tenant',
          );
        }
        data.assignedUser = { connect: { id: assignedUserId } };
      } else {
        data.assignedUser = { disconnect: true };
      }
    }

    if ('nextActionAt' in rawBody) {
      const nextActionAt = rawBody.nextActionAt as string | null;
      data.nextActionAt = nextActionAt === null ? null : new Date(nextActionAt);
    }

    return this.prisma.lead.update({ where: { id: leadId }, data });
  }
}
