import { validateEnv } from './env.schema';

function validEnv(overrides: Record<string, unknown> = {}) {
  return {
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
    REDIS_URL: 'redis://localhost:6379',
    META_APP_SECRET: 'secret',
    META_VERIFY_TOKEN: 'verify-token',
    APP_ENCRYPTION_KEY: 'a'.repeat(64),
    OPENAI_API_KEY: 'sk-test',
    GROQ_API_KEY: 'gsk-test',
    ADMIN_MASTER_KEY: 'master-key',
    PUBLIC_BASE_URL: 'https://example.com',
    ...overrides,
  };
}

describe('validateEnv', () => {
  it('acepta un entorno completo y aplica los defaults documentados', () => {
    const config = validateEnv(validEnv());

    expect(config.NODE_ENV).toBe('development');
    expect(config.PORT).toBe(3000);
    expect(config.LLM_MODEL).toBe('gpt-4o-mini');
    expect(config.STT_PROVIDER).toBe('groq');
    expect(config.DEBOUNCE_SECONDS).toBe(6);
  });

  it('respeta valores explícitos por sobre los defaults', () => {
    const config = validateEnv(
      validEnv({
        DEBOUNCE_SECONDS: '10',
        STT_PROVIDER: 'openai',
        PORT: '4000',
      }),
    );

    expect(config.DEBOUNCE_SECONDS).toBe(10);
    expect(config.STT_PROVIDER).toBe('openai');
    expect(config.PORT).toBe(4000);
  });

  it.each([
    'DATABASE_URL',
    'REDIS_URL',
    'META_APP_SECRET',
    'META_VERIFY_TOKEN',
    'APP_ENCRYPTION_KEY',
    'OPENAI_API_KEY',
    'GROQ_API_KEY',
    'ADMIN_MASTER_KEY',
    'PUBLIC_BASE_URL',
  ])(
    'falla con un mensaje claro que menciona %s cuando falta',
    (missingKey) => {
      const env = validEnv();
      delete (env as Record<string, unknown>)[missingKey];

      expect(() => validateEnv(env)).toThrow(new RegExp(missingKey));
    },
  );

  it('rechaza APP_ENCRYPTION_KEY que no sea hex de 64 caracteres (32 bytes)', () => {
    expect(() =>
      validateEnv(validEnv({ APP_ENCRYPTION_KEY: 'demasiado-corta' })),
    ).toThrow(/APP_ENCRYPTION_KEY/);
  });

  it('rechaza STT_PROVIDER fuera de groq|openai', () => {
    expect(() => validateEnv(validEnv({ STT_PROVIDER: 'azure' }))).toThrow(
      /STT_PROVIDER/,
    );
  });
});
