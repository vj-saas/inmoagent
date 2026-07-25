import { Prisma } from '@prisma/client';

/**
 * Forma "segura" de un `Tenant` para respuestas de admin: excluye explícitamente
 * `accessTokenEnc` y `apiKeyHash`. Consumida por `updateConfig()` (PATCH config)
 * y cualquier otro endpoint que necesite devolver el tenant sin secretos.
 */
export interface TenantConfigResponse {
  id: string;
  name: string;
  slug: string;
  active: boolean;
  phoneNumberId: string;
  wabaId: string | null;
  displayPhone: string | null;
  botName: string;
  botTone: string;
  schedulingLink: string | null;
  humanHours: string | null;
  competitorsToAvoid: string[];
  coverageAreas: string[];
  privacyNoticeSent: boolean;
  welcomeIntro: string | null;
  handoffIntro: string | null;
  alertPhone: string | null;
  alertsEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Whitelist EXPLÍCITA de columnas para `prisma.tenant.update({ select: ... })` /
 * `findFirst`/etc. Fail-closed a propósito: si mañana se agrega una columna
 * secreta nueva al modelo `Tenant`, NO se filtra sola acá — hay que agregarla
 * a mano. Nunca debe incluir `accessTokenEnc` ni `apiKeyHash`.
 */
export const TENANT_CONFIG_SELECT = {
  id: true,
  name: true,
  slug: true,
  active: true,
  phoneNumberId: true,
  wabaId: true,
  displayPhone: true,
  botName: true,
  botTone: true,
  schedulingLink: true,
  humanHours: true,
  competitorsToAvoid: true,
  coverageAreas: true,
  privacyNoticeSent: true,
  welcomeIntro: true,
  handoffIntro: true,
  alertPhone: true,
  alertsEnabled: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.TenantSelect;
