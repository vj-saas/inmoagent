import { Injectable } from '@nestjs/common';
import type { Lead } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class LeadsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Busca el lead de `phone` en `tenantId` o lo crea si es su primer mensaje. */
  findOrCreateByPhone(tenantId: string, phone: string): Promise<Lead> {
    const now = new Date();
    return this.prisma.lead.upsert({
      where: { tenantId_phone: { tenantId, phone } },
      update: { lastMessageAt: now },
      create: { tenantId, phone, lastMessageAt: now },
    });
  }
}
