import { pickVariant } from './copy-variants.util';

describe('pickVariant', () => {
  const variants = ['a', 'b', 'c', 'd'];

  it('AC-1: devuelve la misma variante para el mismo seed', () => {
    const seed = 'lead123:5';
    expect(pickVariant(variants, seed)).toBe(pickVariant(variants, seed));
  });

  it('AC-2: no repite variante en turnos consecutivos del mismo lead', () => {
    for (let turn = 0; turn < 20; turn++) {
      const current = pickVariant(variants, `lead123:${turn}`);
      const next = pickVariant(variants, `lead123:${turn + 1}`);
      expect(next).not.toBe(current);
    }
  });

  it('AC-2: sigue sin repetir con solo 2 variantes', () => {
    const two = ['x', 'y'];
    for (let turn = 0; turn < 10; turn++) {
      const current = pickVariant(two, `leadABC:${turn}`);
      const next = pickVariant(two, `leadABC:${turn + 1}`);
      expect(next).not.toBe(current);
    }
  });

  it('AC-3: con un solo elemento lo devuelve siempre, sin fallar', () => {
    expect(pickVariant(['unico'], 'lead1:0')).toBe('unico');
    expect(pickVariant(['unico'], 'lead1:1')).toBe('unico');
  });

  it('lanza si la lista de variantes está vacía', () => {
    expect(() => pickVariant([], 'lead1:0')).toThrow();
  });

  it('leads distintos pueden tener offsets distintos para el mismo turno', () => {
    // No es un AC estricto, pero valida que el hash del leadId realmente pesa.
    const a = pickVariant(variants, 'leadA:0');
    const b = pickVariant(variants, 'leadB:0');
    // No forzamos que sean distintos (podría coincidir por azar), solo que
    // ambos sean valores válidos del pool.
    expect(variants).toContain(a);
    expect(variants).toContain(b);
  });

  it('seed sin turnCount (sin ":") no rompe y es determinístico', () => {
    expect(pickVariant(variants, 'seed-plano')).toBe(
      pickVariant(variants, 'seed-plano'),
    );
  });
});
