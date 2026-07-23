import {
  generateTemporaryPassword,
  hashPassword,
  verifyPassword,
} from './password.util';

describe('password.util', () => {
  it('hashea y verifica correctamente la misma contraseña (roundtrip)', async () => {
    const hash = await hashPassword('unaClaveSegura123');

    expect(hash).not.toBe('unaClaveSegura123'); // no es texto plano
    await expect(verifyPassword(hash, 'unaClaveSegura123')).resolves.toBe(true);
  });

  it('rechaza una contraseña incorrecta', async () => {
    const hash = await hashPassword('unaClaveSegura123');

    await expect(verifyPassword(hash, 'otraClave')).resolves.toBe(false);
  });

  it('devuelve false (no lanza) ante un hash malformado', async () => {
    await expect(verifyPassword('no-es-un-hash-argon2', 'x')).resolves.toBe(
      false,
    );
  });

  it('genera contraseñas temporales alfanuméricas que superan @MinLength(8)', () => {
    for (let i = 0; i < 50; i++) {
      const pwd = generateTemporaryPassword();
      expect(pwd).toHaveLength(16);
      expect(pwd.length).toBeGreaterThanOrEqual(8);
      expect(pwd).toMatch(/^[A-Za-z0-9]+$/);
    }
  });

  it('genera contraseñas temporales distintas entre sí (entropía)', () => {
    const generated = new Set(
      Array.from({ length: 100 }, () => generateTemporaryPassword()),
    );
    expect(generated.size).toBe(100);
  });
});
