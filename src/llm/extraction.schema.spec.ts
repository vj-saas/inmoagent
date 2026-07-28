import {
  rawExtractionSchema,
  sanitizeExtraction,
  sanitizeLeadName,
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
    priceFlexible: false,
    extraRequirements: null,
    interestedPropertyIndex: null,
    name: null,
    timeline: null,
    guarantee: null,
    paymentMethod: null,
    hasPropertyToSell: null,
    visitAvailability: null,
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
      'busco en Palermo Soho o Caballito',
    );
    expect(result.neighborhoods).toEqual(['palermo', 'caballito']);
  });

  it('descarta precio <= 0 sin invalidar el resto de la extracción', () => {
    const result = sanitizeExtraction(
      raw({ operation: 'SALE', maxPrice: -100 }),
      'quiero comprar',
    );
    expect(result.maxPrice).toBeNull();
    expect(result.operation).toBe('SALE');
  });

  it('descarta rooms > 10', () => {
    const result = sanitizeExtraction(raw({ minRooms: 15 }), 'quince ambientes');
    expect(result.minRooms).toBeNull();
  });

  it('mantiene rooms válidos', () => {
    const result = sanitizeExtraction(raw({ minRooms: 3 }), '3 ambientes');
    expect(result.minRooms).toBe(3);
  });

  it('acepta zonas que no están en el diccionario (se confía en el LLM), normalizadas', () => {
    const result = sanitizeExtraction(
      raw({
        neighborhoods: ['Monte Grande'],
        extraRequirements: 'con patio',
      }),
      'busco en Monte Grande, con patio',
    );
    // La zona se toma como filtro (aunque no esté en el diccionario); si no hay
    // stock, el flujo avisa (empty_zone). No se mezcla con extraRequirements.
    expect(result.neighborhoods).toEqual(['monte grande']);
    expect(result.extraRequirements).toBe('con patio');
  });

  it('resuelve alias de barrio conocido (Palermo Soho -> palermo)', () => {
    const result = sanitizeExtraction(
      raw({ neighborhoods: ['Palermo Soho'] }),
      'depto en Palermo Soho',
    );
    expect(result.neighborhoods).toEqual(['palermo']);
  });

  it('descarta barrios que el LLM re-listó del historial pero NO se mencionan en este turno (bug real: zonas descartadas resucitaban)', () => {
    const result = sanitizeExtraction(
      raw({ neighborhoods: ['monte grande', 'guillon', 'recoleta'] }),
      // El lead solo preguntó por Recoleta en ESTE turno; "monte grande" y
      // "guillon" son resaca de turnos previos que el LLM re-extrajo.
      'Y en Recoleta tienen alguno?',
    );
    expect(result.neighborhoods).toEqual(['recoleta']);
  });

  it('si ningún barrio devuelto aparece en el turno, neighborhoods queda vacío (el merge conserva lo previo)', () => {
    const result = sanitizeExtraction(
      raw({ neighborhoods: ['monte grande'] }),
      'mas baratos no hay?',
    );
    expect(result.neighborhoods).toEqual([]);
  });

  // spec 09, T1.1: nombre del lead, siempre validado contra el turno.
  it('AC-14: acepta el nombre si el lead se presenta explícitamente', () => {
    const result = sanitizeExtraction(
      raw({ name: 'Martín' }),
      'hola! soy Martín, busco depto en caballito',
    );
    expect(result.name).toBe('Martín');
  });

  it('AC-15: descarta el nombre si NO aparece en el texto del turno (alucinación del LLM)', () => {
    const result = sanitizeExtraction(
      raw({ name: 'Juan' }),
      'busco depto en caballito',
    );
    expect(result.name).toBeNull();
  });

  it('AC-16: descarta el nombre si es un barrio conocido', () => {
    const result = sanitizeExtraction(
      raw({ name: 'Recoleta' }),
      'busco en Recoleta',
    );
    expect(result.name).toBeNull();
  });

  it('AC-16: descarta el nombre si es una palabra de la lista negra (saludo/muletilla)', () => {
    const result = sanitizeExtraction(raw({ name: 'Hola' }), 'Hola! buenas');
    expect(result.name).toBeNull();
  });

  // spec 09, T1.3: calificación comercial, siempre a un conjunto cerrado.
  it('AC-22: acepta "guarantee" cuando matchea el conjunto cerrado', () => {
    const result = sanitizeExtraction(
      raw({ guarantee: 'propietaria' }),
      'tengo garantía propietaria',
    );
    expect(result.guarantee).toBe('propietaria');
  });

  it('AC-23: acepta "paymentMethod" cuando matchea el conjunto cerrado', () => {
    const result = sanitizeExtraction(
      raw({ paymentMethod: 'contado' }),
      'pago contado',
    );
    expect(result.paymentMethod).toBe('contado');
  });

  it('AC-24: mapea "timeline" a los 4 valores cerrados', () => {
    expect(
      sanitizeExtraction(raw({ timeline: 'inmediato' }), 'necesito ya')
        .timeline,
    ).toBe('inmediato');
    expect(
      sanitizeExtraction(raw({ timeline: '1-3 meses' }), 'para marzo')
        .timeline,
    ).toBe('1-3 meses');
    expect(
      sanitizeExtraction(raw({ timeline: 'explorando' }), 'viendo nomás')
        .timeline,
    ).toBe('explorando');
  });

  it('AC-25: descarta "timeline"/"guarantee"/"paymentMethod" fuera del conjunto cerrado (no persiste texto crudo)', () => {
    const result = sanitizeExtraction(
      raw({
        timeline: 'lo antes posible',
        guarantee: 'tengo un aval de mi tío',
        paymentMethod: 'transferencia',
      }),
      'lo antes posible, con aval de mi tío, transferencia',
    );
    expect(result.timeline).toBeNull();
    expect(result.guarantee).toBeNull();
    expect(result.paymentMethod).toBeNull();
  });

  it('es case-insensitive y tolera espacios extra en los valores cerrados', () => {
    const result = sanitizeExtraction(
      raw({ guarantee: '  PROPIETARIA  ' }),
      'garantía propietaria',
    );
    expect(result.guarantee).toBe('propietaria');
  });

  it('"hasPropertyToSell" pasa tal cual (ya es boolean, sin normalizar)', () => {
    expect(sanitizeExtraction(raw({ hasPropertyToSell: true }), 'x').hasPropertyToSell).toBe(true);
    expect(sanitizeExtraction(raw({ hasPropertyToSell: false }), 'x').hasPropertyToSell).toBe(false);
    expect(sanitizeExtraction(raw({}), 'x').hasPropertyToSell).toBeNull();
  });

  it('"visitAvailability" es texto libre, sin normalizar a un enum', () => {
    const result = sanitizeExtraction(
      raw({ visitAvailability: '  sábados a la mañana  ' }),
      'puedo sábados a la mañana',
    );
    expect(result.visitAvailability).toBe('sábados a la mañana');
  });
});

describe('sanitizeLeadName', () => {
  it('acepta un nombre mencionado en el turno y lo capitaliza', () => {
    expect(sanitizeLeadName('martín', 'hola soy martín')).toBe('Martín');
  });

  it('acepta nombre y apellido, capitalizando cada palabra', () => {
    expect(
      sanitizeLeadName('juan carlos', 'me llamo juan carlos, un gusto'),
    ).toBe('Juan Carlos');
  });

  it('null si rawName es null', () => {
    expect(sanitizeLeadName(null, 'hola')).toBeNull();
  });

  it('null si es demasiado corto (1 caracter)', () => {
    expect(sanitizeLeadName('J', 'soy J')).toBeNull();
  });

  it('null si es demasiado largo (> 40 caracteres)', () => {
    const long = 'a'.repeat(41);
    expect(sanitizeLeadName(long, `soy ${long}`)).toBeNull();
  });

  it('null si es un barrio conocido (case/tilde-insensitive)', () => {
    expect(sanitizeLeadName('belgrano', 'busco en belgrano')).toBeNull();
    expect(sanitizeLeadName('Palermo', 'busco en Palermo')).toBeNull();
  });

  it.each(['Hola', 'buenas', 'gracias', 'dale', 'Che', 'joya'])(
    'null si es la palabra de lista negra "%s"',
    (word) => {
      expect(sanitizeLeadName(word, `${word}, como va`)).toBeNull();
    },
  );

  it('null si no aparece (ni con tolerancia a typos) en el texto del turno', () => {
    expect(sanitizeLeadName('Martín', 'busco depto en caballito')).toBeNull();
  });

  it('tolera un pequeño error de tipeo (mismo criterio que textMentionsNeighborhood)', () => {
    expect(sanitizeLeadName('Martin', 'hola soy Martn, busco depto')).toBe(
      'Martin',
    );
  });
});
