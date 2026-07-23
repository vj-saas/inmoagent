import {
  isKnownNeighborhood,
  normalizeNeighborhood,
  textMentionsNeighborhood,
} from './neighborhoods';

describe('normalizeNeighborhood', () => {
  it('normaliza una sub-zona coloquial a su barrio canónico', () => {
    expect(normalizeNeighborhood('Palermo Soho')).toBe('palermo');
  });

  it('es insensible a mayúsculas, tildes y espacios extra', () => {
    expect(normalizeNeighborhood('  Ñuñez  ')).toBe('nunez');
    expect(normalizeNeighborhood('CONSTITUCIÓN')).toBe('constitucion');
    expect(normalizeNeighborhood('villa   urquiza')).toBe('villa urquiza');
  });

  it('resuelve alias de GBA norte/oeste/sur', () => {
    expect(normalizeNeighborhood('Vte Lopez')).toBe('vicente lopez');
    expect(normalizeNeighborhood('Ramos')).toBe('ramos mejia');
    expect(normalizeNeighborhood('barrio norte')).toBe('recoleta');
  });

  it('devuelve el texto normalizado tal cual si no hay alias conocido', () => {
    expect(normalizeNeighborhood('Un Barrio Inventado')).toBe(
      'un barrio inventado',
    );
  });
});

describe('isKnownNeighborhood', () => {
  it('reconoce barrios canónicos de CABA y GBA', () => {
    expect(isKnownNeighborhood('Palermo Soho')).toBe(true);
    expect(isKnownNeighborhood('Caballito')).toBe(true);
    expect(isKnownNeighborhood('San Isidro')).toBe(true);
  });

  it('no reconoce barrios fuera del diccionario', () => {
    expect(isKnownNeighborhood('Un Barrio Inventado')).toBe(false);
  });
});

describe('textMentionsNeighborhood', () => {
  it('acepta match exacto', () => {
    expect(textMentionsNeighborhood('busco en Recoleta', 'Recoleta')).toBe(
      true,
    );
  });

  it('tolera un typo chico (el LLM corrige la ortografía al extraer)', () => {
    // Bug real: "caballto" (falta la "i") -> el LLM devuelve "Caballito"
    // corregido, y un match exacto de substring lo rechazaba.
    expect(
      textMentionsNeighborhood('busco depa x caballto pa alkilar', 'Caballito'),
    ).toBe(true);
  });

  it('rechaza un barrio que no aparece para nada en el texto', () => {
    expect(
      textMentionsNeighborhood('Y en Recoleta tienen alguno?', 'Monte Grande'),
    ).toBe(false);
    expect(
      textMentionsNeighborhood('mas baratos no hay?', 'Monte Grande'),
    ).toBe(false);
  });

  it('en barrios de varias palabras exige que TODAS matcheen (no acepta por una palabra genérica compartida)', () => {
    expect(
      textMentionsNeighborhood('quiero en villa devoto', 'Villa Urquiza'),
    ).toBe(false);
    expect(
      textMentionsNeighborhood('quiero en villa urquiza', 'Villa Urquiza'),
    ).toBe(true);
  });
});
