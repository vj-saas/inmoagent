import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import * as argon2 from 'argon2';
import { randomBytes } from 'node:crypto';
import { encrypt } from '../../common/crypto';
import type { EnvConfig } from '../../config/env.schema';
import { PrismaService } from '../../prisma/prisma.service';
import type { CreateTenantDto } from './create-tenant.dto';
import { TENANT_CONFIG_SELECT } from './tenant-config-response';
import type { TenantConfigResponse } from './tenant-config-response';
import type { UpdateTenantConfigDto } from './update-tenant-config.dto';
import type { UpdateTokenDto } from './update-token.dto';

/** Normaliza un string opcional: trim y "" -> null. `undefined` se propaga tal cual. */
function normalizeOptionalText(
  value: string | undefined,
): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

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
   * PATCH parcial de configuración de un tenant. Arma `data` campo por campo
   * (nunca spread del body crudo) solo con las claves presentes en el `dto`.
   * Un PATCH sin campos no toca la DB (no mueve `updatedAt`).
   */
  async updateConfig(
    tenantId: string,
    dto: UpdateTenantConfigDto,
  ): Promise<TenantConfigResponse> {
    const data: Prisma.TenantUpdateInput = {};

    if (dto.alertPhone !== undefined) {
      data.alertPhone = normalizeOptionalText(dto.alertPhone);
    }
    if (dto.alertsEnabled !== undefined) {
      data.alertsEnabled = dto.alertsEnabled;
    }
    if (dto.humanHours !== undefined) {
      data.humanHours = normalizeOptionalText(dto.humanHours);
    }
    if (dto.botName !== undefined) {
      data.botName = dto.botName.trim();
    }
    if (dto.botTone !== undefined) {
      data.botTone = dto.botTone.trim();
    }
    if (dto.schedulingLink !== undefined) {
      data.schedulingLink = normalizeOptionalText(dto.schedulingLink);
    }
    if (dto.coverageAreas !== undefined) {
      data.coverageAreas = dto.coverageAreas;
    }
    if (dto.competitorsToAvoid !== undefined) {
      data.competitorsToAvoid = dto.competitorsToAvoid;
    }
    if (dto.displayPhone !== undefined) {
      data.displayPhone = normalizeOptionalText(dto.displayPhone);
    }
    if (dto.welcomeIntro !== undefined) {
      data.welcomeIntro = normalizeOptionalText(dto.welcomeIntro);
    }
    if (dto.handoffIntro !== undefined) {
      data.handoffIntro = normalizeOptionalText(dto.handoffIntro);
    }

    if (Object.keys(data).length === 0) {
      const tenant = await this.prisma.tenant.findFirst({
        where: { id: tenantId },
        select: TENANT_CONFIG_SELECT,
      });
      if (!tenant) {
        throw new NotFoundException('Tenant no encontrado');
      }
      return tenant;
    }

    try {
      return await this.prisma.tenant.update({
        where: { id: tenantId },
        data,
        select: TENANT_CONFIG_SELECT,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException('Tenant no encontrado');
      }
      throw error;
    }
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
