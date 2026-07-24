import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ConversationState, type Prisma } from '@prisma/client';
import { TenantThrottlerGuard } from '../../common/tenant-throttler.guard';
import { DebounceBufferService } from '../../pipeline/debounce-buffer.service';
import { PrismaService } from '../../prisma/prisma.service';
import { PersonOrApiKeyGuard } from '../guards/person-or-api-key.guard';
import { ListLeadsQueryDto } from './list-leads-query.dto';

const PAGE_SIZE = 20;

@Controller('admin/tenants/:tenantId/leads')
@UseGuards(TenantThrottlerGuard, PersonOrApiKeyGuard)
@Throttle({ default: { limit: 120, ttl: 60_000 } })
export class AdminLeadsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly debounceBuffer: DebounceBufferService,
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
    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, tenantId },
    });
    if (!lead) {
      throw new NotFoundException('Lead no encontrado');
    }
    return lead;
  }

  @Get(':leadId/messages')
  async messages(
    @Param('tenantId') tenantId: string,
    @Param('leadId') leadId: string,
  ) {
    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, tenantId },
    });
    if (!lead) {
      throw new NotFoundException('Lead no encontrado');
    }

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
    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, tenantId },
    });
    if (!lead) {
      throw new NotFoundException('Lead no encontrado');
    }
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
    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, tenantId },
    });
    if (!lead) {
      throw new NotFoundException('Lead no encontrado');
    }

    await this.debounceBuffer.purgeLead(tenantId, leadId);
    await this.prisma.lead.delete({ where: { id: leadId } }); // cascade: Message, Appointment
    return { deleted: true };
  }
}
