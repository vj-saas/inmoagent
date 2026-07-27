import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { PersonOrApiKeyGuard } from '../guards/person-or-api-key.guard';
import { PersonSessionRequiredGuard } from '../guards/person-session-required.guard';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedPersonRequest } from '../../auth/authenticated-person-request';

import { IsNotEmpty, IsString } from 'class-validator';

export class CreatePushSubscriptionDto {
  @IsString()
  @IsNotEmpty()
  endpoint: string;

  @IsString()
  @IsNotEmpty()
  p256dh: string;

  @IsString()
  @IsNotEmpty()
  auth: string;
}

export class DeletePushSubscriptionDto {
  @IsString()
  @IsNotEmpty()
  endpoint: string;
}

@Controller('admin/tenants/:tenantId/push-subscriptions')
@UseGuards(PersonOrApiKeyGuard, PersonSessionRequiredGuard)
export class AdminPushSubscriptionsController {
  constructor(private readonly prisma: PrismaService) {}

  @Post()
  async register(
    @Req() req: AuthenticatedPersonRequest,
    @Body() dto: CreatePushSubscriptionDto,
  ) {
    const endpoint = dto.endpoint;
    const p256dh = dto.p256dh;
    const auth = dto.auth;

    if (!endpoint || !p256dh || !auth) {
      throw new NotFoundException('Faltan campos requeridos');
    }

    const sub = await this.prisma.pushSubscription.upsert({
      where: { endpoint },
      update: {
        p256dh,
        auth,
        personId: req.person.id,
        tenantId: req.person.tenantId,
      },
      create: {
        endpoint,
        p256dh,
        auth,
        personId: req.person.id,
        tenantId: req.person.tenantId,
      },
    });

    return { id: sub.id };
  }

  @Delete()
  @HttpCode(HttpStatus.OK)
  async unregister(
    @Req() req: AuthenticatedPersonRequest,
    @Body() dto: DeletePushSubscriptionDto,
  ) {
    // AC-3 / AC-4 / AC-12: Must belong to requesting person AND tenant.
    // Otherwise return 404 (does not expose subscription existence on other accounts).
    const sub = await this.prisma.pushSubscription.findFirst({
      where: {
        endpoint: dto.endpoint,
        personId: req.person.id,
        tenantId: req.person.tenantId,
      },
    });

    if (!sub) {
      throw new NotFoundException('Suscripción no encontrada');
    }

    await this.prisma.pushSubscription.delete({
      where: { id: sub.id },
    });

    return { success: true };
  }
}
