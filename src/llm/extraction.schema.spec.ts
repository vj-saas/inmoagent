import {
  rawExtractionSchema,
  sanitizeExtraction,
  type RawExtraction,
} from './extraction.schema';

function raw(overrides: Partial<RawExtraction> = {}): RawExtraction {
  return {
    intent: 'provide_info',
    operation: null,
    neighborhoods: [],
    maxPrice: null,
    currency: null,
    minRooms: null,
    wantsGarage: null,
    wantsPetsAllowed: null,
    roomsInferred: false,
    extraRequirements: null,
    interestedPropertyIndex: null,
    ...overrides,
  };
}

describe('rawExtractionSchema', () => {
  it('parsea una extracción válida', () => {
    const result = rawExtractionSchema.safeParse(
      raw({
        operation: 'RENT',
        neighborhoods: ['Caballito'],
        maxPrice: 500000,
        currency: 'ARS',
        minRooms: 2,
      }),
    );
    expect(result.success).toBe(true);
  });

  it('rechaza un intent fuera del enum (schema inválido -> dispara reintento en el provider)', () => {
    const result = rawExtractionSchema.safeParse({
      ...raw(),
      intent: 'comprar_casa_ya',
    });
    expect(result.success).toBe(false);
  });
});

describe('sanitizeExtraction', () => {
  it('normaliza barrios conocidos', () => {
    const result = sanitizeExtraction(
      raw({ neighborhoods: ['Palermo Soho', 'CABALLITO'] }),
    );
    expect(result.neighborhoods).toEqual(['palermo', 'caballito']);
  });

  it('descarta precio <= 0 sin invalidar el resto de la extracción', () => {
    const result = sanitizeExtraction(
      raw({ operation: 'SALE', maxPrice: -100 }),
    );
    expect(result.maxPrice).toBeNull();
    expect(result.operation).toBe('SALE');
  });

  it('descarta rooms > 10', () => {
    const result = sanitizeExtraction(raw({ minRooms: 15 }));
    expect(result.minRooms).toBeNull();
  });

  it('mantiene rooms válidos', () => {
    const result = sanitizeExtraction(raw({ minRooms: 3 }));
    expect(result.minRooms).toBe(3);
  });

  it('acepta zonas que no están en el diccionario (se confía en el LLM), normalizadas', () => {
    const result = sanitizeExtraction(
      raw({
        neighborhoods: ['Monte Grande'],
        extraRequirements: 'con patio',
      }),
    );
    // La zona se toma como filtro (aunque no esté en el diccionario); si no hay
    // stock, el flujo avisa (empty_zone). No se mezcla con extraRequirements.
    expect(result.neighborhoods).toEqual(['monte grande']);
    expect(result.extraRequirements).toBe('con patio');
  });

  it('resuelve alias de barrio conocido (Palermo Soho -> palermo)', () => {
    const result = sanitizeExtraction(raw({ neighborhoods: ['Palermo Soho'] }));
    expect(result.neighborhoods).toEqual(['palermo']);
  });
});
