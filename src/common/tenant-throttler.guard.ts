import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Throttling por tenant (no por IP): usa `:tenantId` de la ruta para el admin,
 * o `phone_number_id` del payload para el webhook. Se aplica ADEMÁS del
 * throttling global por IP (`ThrottlerGuard` como APP_GUARD), no en su lugar.
 */
@Injectable()
export class TenantThrottlerGuard extends ThrottlerGuard {
  protected getTracker(req: Record<string, unknown>): Promise<string> {
    const params = req.params as Record<string, string> | undefined;
    if (params?.tenantId) {
      return Promise.resolve(`tenant:${params.tenantId}`);
    }

    const phoneNumberId = this.extractPhoneNumberId(req.body);
    if (phoneNumberId) {
      return Promise.resolve(`phone:${phoneNumberId}`);
    }

    return Promise.resolve((req.ip as string | undefined) ?? 'unknown');
  }

  private extractPhoneNumberId(body: unknown): string | undefined {
    try {
      const entry = (
        body as {
          entry?: Array<{
            changes?: Array<{
              value?: { metadata?: { phone_number_id?: string } };
            }>;
          }>;
        }
      )?.entry;
      return entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id;
    } catch {
      return undefined;
    }
  }
}
