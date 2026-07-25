import { ConflictException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import * as argon2 from 'argon2';
import { randomBytes } from 'node:crypto';
import { encrypt } from '../../common/crypto';
import type { EnvConfig } from '../../config/env.schema';
import { PrismaService } from '../../prisma/prisma.service';
import type { CreateTenantDto } from './create-tenant.dto';
import type { UpdateTokenDto } from './update-token.dto';

export interface CreatedTenant {
  tenantId: string;
  /** Sólo se devuelve acá, en la respuesta de creación; no se puede volver a mostrar. */
  apiKey: string;
}

@Injectable()
export class TenantsAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  async create(dto: CreateTenantDto): Promise<CreatedTenant> {
    const apiKey = `live_${randomBytes(24).toString('hex')}`;
    const apiKeyHash = await argon2.hash(apiKey);
    const accessTokenEnc = encrypt(
      dto.accessToken,
      this.config.get('APP_ENCRYPTION_KEY', { infer: true }),
    );

    try {
      const tenant = await this.prisma.tenant.create({
        data: {
          name: dto.name,
          slug: dto.slug,
          phoneNumberId: dto.phoneNumberId,
          wabaId: dto.wabaId,
          accessTokenEnc,
          displayPhone: dto.displayPhone,
          botName: dto.botName,
          botTone: dto.botTone,
          schedulingLink: dto.schedulingLink,
          humanHours: dto.humanHours,
          competitorsToAvoid: dto.competitorsToAvoid ?? [],
          coverageAreas: dto.coverageAreas ?? [],
          alertPhone: dto.alertPhone,
          alertsEnabled: dto.alertsEnabled ?? false,
          apiKeyHash,
        },
      });
      return { tenantId: tenant.id, apiKey };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'Ya existe un tenant con ese slug o phoneNumberId',
        );
      }
      throw error;
    }
  }

  /** Rota el access token de Meta de un tenant existente (se cifra antes de guardarlo). */
  async updateAccessToken(
    tenantId: string,
    dto: UpdateTokenDto,
  ): Promise<{ rotatedAt: Date }> {
    const accessTokenEnc = encrypt(
      dto.accessToken,
      this.config.get('APP_ENCRYPTION_KEY', { infer: true }),
    );

    const tenant = await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { accessTokenEnc },
    });
    return { rotatedAt: tenant.updatedAt };
  }

  /**
   * Estado de conexión del webhook para un tenant. `connected` es un OR entre
   * eventos de webhook recibidos y leads con mensajes: `MaintenanceProcessor`
   * purga `WebhookEvent` de más de 30 días, así que un tenant con actividad
   * antigua igual debe reportar `connected: true` gracias al lead.
   */
  async webhookStatus(tenantId: string): Promise<{
    connected: boolean;
    lastEventAt: Date | null;
    lastMessageAt: Date | null;
  }> {
    const [lastEvent, lastLead] = await Promise.all([
      this.prisma.webhookEvent.findFirst({
        where: { tenantId },
        orderBy: { receivedAt: 'desc' },
        select: { receivedAt: true },
      }),
      this.prisma.lead.findFirst({
        where: { tenantId, lastMessageAt: { not: null } },
        orderBy: { lastMessageAt: 'desc' },
        select: { lastMessageAt: true },
      }),
    ]);

    return {
      connected: lastEvent !== null || lastLead !== null,
      lastEventAt: lastEvent?.receivedAt ?? null,
      lastMessageAt: lastLead?.lastMessageAt ?? null,
    };
  }
}
