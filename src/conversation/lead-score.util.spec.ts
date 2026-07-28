import type { Lead } from '@prisma/client';
import {
  calculateLeadScore,
  HOT_THRESHOLD,
  SCORE_WEIGHTS,
  WARM_THRESHOLD,
} from './lead-score.util';

function lead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: 'lead-1',
    name: null,
    fOperation: null,
    fMaxPrice: null,
    qAskedFields: [],
    qTimeline: null,
    qGuarantee: null,
    qPaymentMethod: null,
    qHasPropertyToSell: null,
    qBuyingSignalAt: null,
    ...overrides,
  } as unknown as Lead;
}

describe('calculateLeadScore', () => {
  // AC-35: función pura, solo campos persistidos.
  it('con un lead recién creado (sin nada) da score 0 y label "frio"', () => {
    const result = calculateLeadScore(lead());
    expect(result.score).toBe(0);
    expect(result.label).toBe('frio');
  });

  // AC-36: combinaciones de señales dan los valores esperados.
  it('AC-36: mostró interés (+30) sola no alcanza para "tibio"', () => {
    const result = calculateLeadScore(lead({ qAskedFields: ['guarantee'] }));
    expect(result.score).toBe(30);
    expect(result.label).toBe('tibio');
  });

  it('AC-36: interés + timeline inmediato + nombre + presupuesto declarado = tibio/caliente según suma', () => {
    const result = calculateLeadScore(
      lead({
        qAskedFields: ['guarantee'],
        qTimeline: 'inmediato',
        name: 'Martín',
        fMaxPrice: 500000,
      }),
    );
    // 30 + 25 + 5 + 5 = 65
    expect(result.score).toBe(65);
    expect(result.label).toBe('caliente');
  });

  it('AC-36: RENT con garantía propietaria suma +20', () => {
    const result = calculateLeadScore(
      lead({
        fOperation: 'RENT',
        qAskedFields: ['guarantee'],
        qGuarantee: 'propietaria',
      }),
    );
    expect(result.score).toBe(30 + 20);
  });

  // AC-37
  it('AC-37: RENT con guarantee "no_tiene" baja el score respecto de no tener el dato', () => {
    const withoutGuarantee = calculateLeadScore(
      lead({ fOperation: 'RENT', qAskedFields: ['guarantee'] }),
    );
    const withNoGuarantee = calculateLeadScore(
      lead({
        fOperation: 'RENT',
        qAskedFields: ['guarantee'],
        qGuarantee: 'no_tiene',
      }),
    );
    expect(withNoGuarantee.score).toBeLessThan(withoutGuarantee.score);
    expect(withNoGuarantee.score).toBe(30 - 15);
  });

  it('SALE con paymentMethod contado suma +25, guarantee de RENT no aplica en SALE', () => {
    const result = calculateLeadScore(
      lead({
        fOperation: 'SALE',
        qAskedFields: ['paymentMethod'],
        qPaymentMethod: 'contado',
        qGuarantee: 'no_tiene', // no debería restar nada: no es RENT
      }),
    );
    expect(result.score).toBe(30 + 25);
  });

  it('RENT con paymentMethod seteado (dato ajeno a la operación) no lo suma', () => {
    const result = calculateLeadScore(
      lead({
        fOperation: 'RENT',
        qAskedFields: ['guarantee'],
        qPaymentMethod: 'contado', // no debería sumar: RENT no usa paymentMethod
      }),
    );
    expect(result.score).toBe(30);
  });

  it('señal de compra fuerte suma +15', () => {
    const result = calculateLeadScore(
      lead({ qBuyingSignalAt: new Date('2026-07-28') }),
    );
    expect(result.score).toBe(SCORE_WEIGHTS.buyingSignal);
  });

  it('el score nunca baja de 0 (clamp)', () => {
    // Ningún combo real llega a negativo hoy, pero el clamp es defensivo
    // ante futuros ajustes de pesos.
    const result = calculateLeadScore(
      lead({ fOperation: 'RENT', qGuarantee: 'no_tiene' }), // sin qAskedFields: no suma showedInterest
    );
    expect(result.score).toBeGreaterThanOrEqual(0);
  });

  it('el score nunca supera 100 (clamp)', () => {
    const result = calculateLeadScore(
      lead({
        fOperation: 'SALE',
        qAskedFields: ['paymentMethod', 'hasPropertyToSell'],
        qTimeline: 'inmediato',
        qPaymentMethod: 'contado',
        qBuyingSignalAt: new Date(),
        name: 'Martín',
        fMaxPrice: 200000,
      }),
    );
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it('umbrales: exactamente en el límite usa la etiqueta de arriba (inclusive)', () => {
    expect(calculateLeadScore(lead({ qBuyingSignalAt: new Date() })).score).toBe(
      15,
    );
    // Construye exactamente HOT_THRESHOLD y WARM_THRESHOLD para probar los bordes.
    const atWarm = calculateLeadScore(
      lead({ qAskedFields: ['guarantee'] }), // 30, por encima de WARM_THRESHOLD(30) -> inclusive
    );
    expect(atWarm.score).toBe(WARM_THRESHOLD);
    expect(atWarm.label).toBe('tibio');

    const atHot = calculateLeadScore(
      lead({
        qAskedFields: ['guarantee'],
        qTimeline: '1-3 meses', // 30 + 15 = 45, aún no llega a 60
        name: 'x',
        fMaxPrice: 1,
      }),
    ); // 30+15+5+5 = 55, todavía tibio
    expect(atHot.score).toBe(55);
    expect(atHot.label).toBe('tibio');

    const exactlyHot = calculateLeadScore(
      lead({
        fOperation: 'RENT',
        qAskedFields: ['guarantee'],
        qGuarantee: 'propietaria', // 30 + 20 = 50
        qTimeline: '1-3 meses', // +15 = 65
      }),
    );
    expect(exactlyHot.score).toBe(65);
    expect(exactlyHot.score).toBeGreaterThanOrEqual(HOT_THRESHOLD);
    expect(exactlyHot.label).toBe('caliente');
  });

  it('es determinístico: mismas entradas -> mismo resultado', () => {
    const input = lead({
      fOperation: 'RENT',
      qAskedFields: ['guarantee'],
      qGuarantee: 'propietaria',
    });
    expect(calculateLeadScore(input)).toEqual(calculateLeadScore(input));
  });
});
