import {
  confirmsPropertyChoice,
  delegatesZoneChoice,
  extractDayPreference,
  isPriceStale,
  normalizeKeycapDigits,
  STALE_PRICE_TURNS,
} from './filters.util';
import type { LeadFilters } from './conversation.types';

function filters(overrides: Partial<LeadFilters> = {}): LeadFilters {
  return {
    fOperation: null,
    fNeighborhoods: [],
    fMaxPrice: null,
    fCurrency: null,
    fMinRooms: null,
    fGarage: null,
    fPetsAllowed: null,
    fNotes: null,
    fOfferedNeighborhoods: [],
    fPriceMentionedAtTurn: null,
    ...overrides,
  };
}

describe('normalizeKeycapDigits (QA 2026-07-27: el LLM extrae mal "2️⃣ ambientes" como minRooms 3)', () => {
  it('convierte un dígito keycap suelto a texto plano', () => {
    expect(normalizeKeycapDigits('2️⃣ ambientes')).toBe('2 ambientes');
  });

  it('convierte varios dígitos keycap en el mismo mensaje', () => {
    expect(normalizeKeycapDigits('me gustó el 1️⃣ y el 3️⃣')).toBe(
      'me gustó el 1 y el 3',
    );
  });

  it('convierte el emoji de "10"', () => {
    expect(normalizeKeycapDigits('tengo 🔟 opciones')).toBe('tengo 10 opciones');
  });

  it('no toca texto sin emojis', () => {
    expect(normalizeKeycapDigits('2 ambientes')).toBe('2 ambientes');
  });
});

describe('confirmsPropertyChoice (guardrail contra falsos positivos de interés)', () => {
  it.each([
    'la 2',
    'el 1 me gusta',
    'me interesa la primera opción que me envió',
    'la segunda me copa',
    'me encanta esa',
    'quiero visitarla',
    'dale, coordiname una visita',
    'la del balcón',
    'opción 3',
    'Great, I like the first one. Can I visit it this week?',
    'me sirve la 3, ¿cuándo puedo ir?',
  ])('"%s" SÍ confirma la elección de una ficha', (text) => {
    expect(confirmsPropertyChoice(text)).toBe(true);
  });

  it.each([
    'dale mostrame',
    'si si dale mostrame lo que haya',
    '2 amb estaria joya',
    'hasta 600 mas o menos',
    'somos 2 con un perro',
    'busco 3 dormitorios',
    'tengo 2 hijos',
    'ok',
    'bueno',
  ])('"%s" NO confirma ninguna elección (no se agenda visita)', (text) => {
    expect(confirmsPropertyChoice(text)).toBe(false);
  });
});

describe('delegatesZoneChoice (lead que delega la elección de barrio)', () => {
  it.each([
    'me da igual el barrio, vos que me recomendas?',
    'cualquier zona me viene bien',
    'donde sea',
    'no tengo preferencia',
    'mostrame lo que tengas',
    'no sé qué barrio la verdad',
  ])('"%s" delega la elección', (text) => {
    expect(delegatesZoneChoice(text)).toBe(true);
  });

  it.each(['en palermo', 'busco en caballito o flores', 'por belgrano'])(
    '"%s" NO delega (nombra zona)',
    (text) => {
      expect(delegatesZoneChoice(text)).toBe(false);
    },
  );
});

describe('isPriceStale (presupuesto/moneda viejo que ya no debería aplicarse)', () => {
  it('no es stale si no hay presupuesto guardado', () => {
    expect(isPriceStale(filters({ fMaxPrice: null }), 50)).toBe(false);
  });

  it('no es stale si no hay dato de cuándo se mencionó (leads de antes de este campo)', () => {
    expect(
      isPriceStale(
        filters({ fMaxPrice: 100000, fPriceMentionedAtTurn: null }),
        50,
      ),
    ).toBe(false);
  });

  it('no es stale dentro de la ventana de gracia', () => {
    const f = filters({ fMaxPrice: 100000, fPriceMentionedAtTurn: 5 });
    expect(isPriceStale(f, 5)).toBe(false); // mismo turno
    expect(isPriceStale(f, 5 + STALE_PRICE_TURNS)).toBe(false); // límite exacto
  });

  it('es stale una vez superada la ventana de turnos', () => {
    const f = filters({ fMaxPrice: 100000, fPriceMentionedAtTurn: 5 });
    expect(isPriceStale(f, 5 + STALE_PRICE_TURNS + 1)).toBe(true);
  });
});

describe('extractDayPreference', () => {
  it('detecta sábado y entre semana', () => {
    expect(extractDayPreference('mejor el sábado')).toBe('sábado');
    expect(extractDayPreference('un martes puedo')).toBe('entre semana');
    expect(extractDayPreference('cuando sea')).toBeNull();
  });
});
