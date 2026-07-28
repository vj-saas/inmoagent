import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { MessageDirection, type Prisma } from '@prisma/client';
import type { Request } from 'express';
import { TenantThrottlerGuard } from '../../common/tenant-throttler.guard';
import type { AuthenticatedPersonRequest } from '../../auth/authenticated-person-request';
import { DebounceBufferService } from '../../pipeline/debounce-buffer.service';
import { PrismaService } from '../../prisma/prisma.service';
import { PersonOrApiKeyGuard } from '../guards/person-or-api-key.guard';
import { PersonSessionRequiredGuard } from '../guards/person-session-required.guard';
import { AdminLeadMessagingService } from './admin-lead-messaging.service';
import { AdminLeadsService } from './admin-leads.service';
import { CreateNoteDto } from './dto/create-note.dto';
import { PatchAssignmentDto } from './dto/patch-assignment.dto';
import { SendManualMessageDto } from './dto/send-manual-message.dto';
import { ListLeadsQueryDto } from './list-leads-query.dto';

/** Request que puede traer `person` adjunta por PersonSessionGuard (null bajo API key). */
type MaybePersonRequest = Request & { person?: { id: string } };

const PAGE_SIZE = 20;

/**
 * Da forma idéntica al campo derivado `lastInboundAt` en `getOne` y
 * `messages` (T9, AC-14): mismo nombre de campo, mismo tipo, sin mutar el
 * `lead` original.
 */
function withLastInboundAt<T extends object>(
  lead: T,
  lastInboundAt: Date | null,
): T & { lastInboundAt: Date | null } {
  return { ...lead, lastInboundAt };
}

@Controller('admin/tenants/:tenantId/leads')
@UseGuards(TenantThrottlerGuard, PersonOrApiKeyGuard)
@Throttle({ default: { limit: 120, ttl: 60_000 } })
export class AdminLeadsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly debounceBuffer: DebounceBufferService,
    private readonly adminLeads: AdminLeadsService,
    private readonly leadMessaging: AdminLeadMessagingService,
  ) {}

  @Get()
  async list(
    @Param('tenantId') tenantId: string,
    @Query() query: ListLeadsQueryDto,
  ) {
    const page = query.page ?? 1;
    const where: Prisma.LeadWhereInput = {
      AND: [
        { tenantId },
        ...(query.state && query.state.length > 0
          ? [{ state: { in: query.state } }]
          : []),
        ...(query.q
          ? [
              {
                OR: [
                  { phone: { contains: query.q, mode: 'insensitive' as const } },
                  { name: { contains: query.q, mode: 'insensitive' as const } },
                ],
              },
            ]
          : []),
      ],
    };

    const [leads, total] = await Promise.all([
      this.prisma.lead.findMany({
        where,
        orderBy: { lastMessageAt: 'desc' },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
      this.prisma.lead.count({ where }),
    ]);

    return { leads, total, page, pageSize: PAGE_SIZE };
  }

  @Get(':leadId')
  async getOne(
    @Param('tenantId') tenantId: string,
    @Param('leadId') leadId: string,
  ) {
    const lead = await this.adminLeads.findLeadOrThrow(tenantId, leadId);
    const lastInboundAt = await this.leadMessaging.findLastInboundAt(
      tenantId,
      leadId,
    );
    return withLastInboundAt(lead, lastInboundAt);
  }

  @Get(':leadId/messages')
  async messages(
    @Param('tenantId') tenantId: string,
    @Param('leadId') leadId: string,
  ) {
    const lead = await this.adminLeads.findLeadOrThrow(tenantId, leadId);

    const messages = await this.prisma.message.findMany({
      where: { tenantId, leadId },
      orderBy: { createdAt: 'asc' },
      include: { sentByPerson: { select: { id: true, email: true } } },
    });

    // Derivado del array ya cargado (último `direction=IN`), sin repetir la
    // query de `findLastInboundAt`: coherente con `getOne` porque ambos
    // pasan por el mismo helper `withLastInboundAt` (AC-14).
    let lastInboundAt: Date | null = null;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].direction === MessageDirection.IN) {
        lastInboundAt = messages[i].createdAt;
        break;
      }
    }

    return { lead: withLastInboundAt(lead, lastInboundAt), messages };
  }

  /** Historial de propiedades mostradas al lead (spec 10, §3.4), más recientes primero. */
  @Get(':leadId/property-views')
  async propertyViews(
    @Param('tenantId') tenantId: string,
    @Param('leadId') leadId: string,
  ) {
    await this.adminLeads.findLeadOrThrow(tenantId, leadId);

    const propertyViews = await this.prisma.leadPropertyView.findMany({
      where: { tenantId, leadId },
      orderBy: { lastShownAt: 'desc' },
    });

    return { propertyViews };
  }

  /**
   * Envío manual de un asesor humano a un lead (spec V-B2). Requiere sesión de
   * persona (`PersonSessionRequiredGuard`, T4): bajo API key no hay a quién
   * atribuir el mensaje como `sentByPersonId`, así que este endpoint SOLO
   * admite el guard de clase con la rama de sesión. Toda la lógica de negocio
   * (opt-out, ventana de servicio, lock, transacción, encolado) vive en
   * `AdminLeadMessagingService.sendManual` (T8) — este método solo adapta el
   * request HTTP.
   */
  @Post(':leadId/send')
  @UseGuards(PersonSessionRequiredGuard)
  async send(
    @Param('tenantId') tenantId: string,
    @Param('leadId') leadId: string,
    @Body() dto: SendManualMessageDto,
    @Req() req: AuthenticatedPersonRequest,
  ) {
    return this.leadMessaging.sendManual(
      tenantId,
      leadId,
      req.person.id,
      dto.text,
    );
  }

  /**
   * Desbloquea un lead en HUMAN_HANDOFF y el bot retoma. El estado de retorno
   * lo decide la FSM (`resolveReleaseState` dentro del service), no este
   * controller: SEARCH_MATCH si ya se le mostraron fichas, QUALIFICATION si no.
   */
  @Post(':leadId/release')
  @HttpCode(200)
  async release(
    @Param('tenantId') tenantId: string,
    @Param('leadId') leadId: string,
  ): Promise<{ released: true }> {
    return this.adminLeads.release(tenantId, leadId);
  }

  /** Derecho de supresión (Ley 25.326): borra el lead + mensajes + turnos pendientes en Redis. */
  @Delete(':leadId')
  @HttpCode(200)
  async suppress(
    @Param('tenantId') tenantId: string,
    @Param('leadId') leadId: string,
  ): Promise<{ deleted: true }> {
    await this.adminLeads.findLeadOrThrow(tenantId, leadId);

    await this.debounceBuffer.purgeLead(tenantId, leadId);
    await this.prisma.lead.delete({ where: { id: leadId } }); // cascade: Message, Appointment, LeadNote
    return { deleted: true };
  }

  /** Crea una nota humana sobre el lead. Autor = persona de sesión (null si API key). */
  @Post(':leadId/notes')
  async createNote(
    @Param('tenantId') tenantId: string,
    @Param('leadId') leadId: string,
    @Body() dto: CreateNoteDto,
    @Req() req: MaybePersonRequest,
  ) {
    const authorPersonId = req.person?.id ?? null;
    return this.adminLeads.createNote(tenantId, leadId, authorPersonId, dto.body);
  }

  /** Lista las notas del lead (más recientes primero). */
  @Get(':leadId/notes')
  async listNotes(
    @Param('tenantId') tenantId: string,
    @Param('leadId') leadId: string,
  ) {
    const notes = await this.adminLeads.listNotes(tenantId, leadId);
    return { notes };
  }

  /** Marca el lead como contactado (gestión humana, no estado de la FSM). */
  @Post(':leadId/contacted')
  @HttpCode(200)
  async contacted(
    @Param('tenantId') tenantId: string,
    @Param('leadId') leadId: string,
  ) {
    return this.adminLeads.markContacted(tenantId, leadId);
  }

  /** Desmarca "contactado" (corrige una marca accidental). */
  @Post(':leadId/uncontacted')
  @HttpCode(200)
  async uncontacted(
    @Param('tenantId') tenantId: string,
    @Param('leadId') leadId: string,
  ) {
    return this.adminLeads.markUncontacted(tenantId, leadId);
  }

  /** Opt-out manual (* → OPTED_OUT), transaccional e idempotente. */
  @Post(':leadId/opt-out')
  @HttpCode(200)
  async optOut(
    @Param('tenantId') tenantId: string,
    @Param('leadId') leadId: string,
  ) {
    return this.adminLeads.optOut(tenantId, leadId);
  }

  /**
   * PATCH parcial de asignación/próxima acción. Se valida el formato con el DTO
   * pero la presencia de cada campo se detecta sobre el body CRUDO (`req.body`),
   * para distinguir "campo ausente" de "campo enviado como null".
   */
  @Patch(':leadId/assignment')
  async assignment(
    @Param('tenantId') tenantId: string,
    @Param('leadId') leadId: string,
    // No borrar este parámetro aunque no se use dentro del método: Nest
    // ejecuta el ValidationPipe (whitelist + shape de PatchAssignmentDto)
    // sobre el body ANTES de entrar acá, y esa es la única validación de
    // forma que corre. El servicio opera sobre `rawBody` (más abajo) para
    // distinguir "campo ausente" de "campo enviado como null".
    @Body() _dto: PatchAssignmentDto,
    @Req() req: Request,
  ) {
    const rawBody = (req.body ?? {}) as Record<string, unknown>;
    return this.adminLeads.patchAssignment(tenantId, leadId, rawBody);
  }
}
