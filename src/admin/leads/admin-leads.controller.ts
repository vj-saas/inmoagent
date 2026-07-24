import {
  BadRequestException,
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
import { ConversationState, type Prisma } from '@prisma/client';
import type { Request } from 'express';
import { TenantThrottlerGuard } from '../../common/tenant-throttler.guard';
import { DebounceBufferService } from '../../pipeline/debounce-buffer.service';
import { PrismaService } from '../../prisma/prisma.service';
import { PersonOrApiKeyGuard } from '../guards/person-or-api-key.guard';
import { AdminLeadsService } from './admin-leads.service';
import { CreateNoteDto } from './dto/create-note.dto';
import { PatchAssignmentDto } from './dto/patch-assignment.dto';
import { ListLeadsQueryDto } from './list-leads-query.dto';

/** Request que puede traer `person` adjunta por PersonSessionGuard (null bajo API key). */
type MaybePersonRequest = Request & { person?: { id: string } };

const PAGE_SIZE = 20;

@Controller('admin/tenants/:tenantId/leads')
@UseGuards(TenantThrottlerGuard, PersonOrApiKeyGuard)
@Throttle({ default: { limit: 120, ttl: 60_000 } })
export class AdminLeadsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly debounceBuffer: DebounceBufferService,
    private readonly adminLeads: AdminLeadsService,
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
    return this.adminLeads.findLeadOrThrow(tenantId, leadId);
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
    });
    return { lead, messages };
  }

  /** Desbloquea un lead en HUMAN_HANDOFF: vuelve a QUALIFICATION y el bot retoma. */
  @Post(':leadId/release')
  @HttpCode(200)
  async release(
    @Param('tenantId') tenantId: string,
    @Param('leadId') leadId: string,
  ): Promise<{ released: true }> {
    const lead = await this.adminLeads.findLeadOrThrow(tenantId, leadId);
    if (lead.state !== ConversationState.HUMAN_HANDOFF) {
      throw new BadRequestException('El lead no está en HUMAN_HANDOFF');
    }

    await this.prisma.lead.update({
      where: { id: leadId },
      data: { state: ConversationState.QUALIFICATION, handoffAt: null },
    });
    return { released: true };
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
