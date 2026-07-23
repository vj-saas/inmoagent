import { z } from 'zod';

/**
 * Todas las env vars requeridas por la app. Boot falla rápido (ver config.module.ts)
 * si falta o es inválida alguna, indicando exactamente cuál.
 */
export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(3000),

  DATABASE_URL: z
    .string()
    .url({ message: 'DATABASE_URL debe ser una URL postgresql:// válida' }),
  REDIS_URL: z
    .string()
    .url({ message: 'REDIS_URL debe ser una URL redis:// válida' }),

  META_APP_SECRET: z.string().min(1, 'META_APP_SECRET es requerido'),
  META_VERIFY_TOKEN: z.string().min(1, 'META_VERIFY_TOKEN es requerido'),

  APP_ENCRYPTION_KEY: z
    .string()
    .length(
      64,
      'APP_ENCRYPTION_KEY debe ser una clave hex de 64 caracteres (32 bytes) para AES-256-GCM',
    )
    .regex(/^[0-9a-fA-F]+$/, 'APP_ENCRYPTION_KEY debe ser hexadecimal'),

  OPENAI_API_KEY: z.string().min(1, 'OPENAI_API_KEY es requerido'),
  GROQ_API_KEY: z.string().min(1, 'GROQ_API_KEY es requerido'),
  LLM_MODEL: z.string().min(1).default('gpt-4o-mini'),

  STT_PROVIDER: z.enum(['groq', 'openai']).default('groq'),
  DEBOUNCE_SECONDS: z.coerce.number().int().positive().default(6),

  // Cotización APROXIMADA usada solo para poder ORDENAR resultados de precio
  // cuando hay stock en USD y ARS mezclado y el lead no dio presupuesto (no
  // hay moneda de referencia). Nunca se usa para filtrar ni para convertir
  // montos mostrados al lead. Ajustar según la cotización vigente.
  USD_ARS_RATE: z.coerce.number().positive().default(1500),

  // Duración de una sesión de persona autenticada (en horas)
  SESSION_TTL_HOURS: z.coerce.number().int().positive().default(12),

  // Máximo número de intentos de login fallidos permitidos
  LOGIN_MAX_FAILED_ATTEMPTS: z.coerce.number().int().positive().default(10),

  // Ventana de tiempo (en minutos) para contar los intentos de login fallidos
  LOGIN_WINDOW_MINUTES: z.coerce.number().int().positive().default(15),

  ADMIN_MASTER_KEY: z.string().min(1, 'ADMIN_MASTER_KEY es requerido'),
  PUBLIC_BASE_URL: z
    .string()
    .url({ message: 'PUBLIC_BASE_URL debe ser una URL válida' }),

  // SOLO para el número de PRUEBA de Meta con destinatarios argentinos: el sandbox
  // exige direccionar al formato local con "15" (54 11 15 XXXXXXXX) aunque el wa_id
  // entrante venga como 549 11 XXXXXXXX. Con un número de producción real NO hace
  // falta (se apaga). Default: false.
  WA_SANDBOX_AR_RECIPIENT: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),

  // Orígenes permitidos para CORS (separados por coma). Default: localhost:5173 (Vite dev).
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:5173')
    .transform((value) => value.split(',').map((origin) => origin.trim())),
});

export type EnvConfig = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): EnvConfig {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Configuración de entorno inválida:\n${details}`);
  }
  return result.data;
}
