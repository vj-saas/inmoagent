import { isKnownNeighborhood, normalizeNeighborhood } from './neighborhoods';

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
