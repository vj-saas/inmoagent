import {
  Body,
  Controller,
  Get,
  HttpCode,
  Logger,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { TenantThrottlerGuard } from '../common/tenant-throttler.guard';
import type { EnvConfig } from '../config/env.schema';
import { WhatsAppWebhookDto } from './dto/whatsapp-webhook.dto';
import { MetaSignatureGuard } from './meta-signature.guard';
import { WebhookService } from './webhook.service';

@Controller('webhook/whatsapp')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(
    private readonly webhookService: WebhookService,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  @Get()
  verify(
    @Query('hub.mode') mode: string | undefined,
    @Query('hub.verify_token') token: string | undefined,
    @Query('hub.challenge') challenge: string | undefined,
    @Res() res: Response,
  ): void {
    const expectedToken = this.config.get('META_VERIFY_TOKEN', { infer: true });

    if (mode === 'subscribe' && token === expectedToken) {
      res.status(200).send(challenge ?? '');
      return;
    }

    this.logger.warn(
      'Intento de verificación de webhook con token/mode inválido',
    );
    res.status(403).send('Forbidden');
  }

  @Post()
  @UseGuards(TenantThrottlerGuard, MetaSignatureGuard)
  // Límite generoso (por tenant, no por IP): sólo debe frenar abuso/bugs, nunca tráfico real de Meta.
  @Throttle({ default: { limit: 300, ttl: 60_000 } })
  @HttpCode(200)
  async receive(@Body() body: WhatsAppWebhookDto): Promise<{ received: true }> {
    await this.webhookService.handlePayload(body);
    return { received: true };
  }

  @Post('calendly')
  @HttpCode(200)
  async receiveCalendly(@Body() body: any): Promise<{ processed: boolean }> {
    this.logger.log(`Recibiendo webhook de Calendly: ${body.event}`);
    const processed = await this.webhookService.handleCalendlyPayload(body);
    return { processed };
  }
}
