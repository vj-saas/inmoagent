import {
  buildDelegatedZoneMessage,
  buildNoResultsMessage,
  buildPartialZoneDropMessage,
  buildSearchClosingQuestion,
  buildTeaserClosingQuestion,
  SAME_RESULTS_MESSAGE,
} from './templates';

describe('buildTeaserClosingQuestion', () => {
  it('con una sola ficha pregunta si "va por ahí" (singular)', () => {
    expect(buildTeaserClosingQuestion(1)).toBe(
      '¿Va por ahí lo que buscás? Para afinarte la búsqueda decime hasta cuánto es tu presupuesto y cuántos ambientes necesitás.',
    );
  });

  it('con varias fichas pregunta "alguna" (plural)', () => {
    expect(buildTeaserClosingQuestion(3)).toContain('¿Alguna va por ahí?');
  });
});

describe('buildSearchClosingQuestion', () => {
  it('con una sola ficha no pregunta "cuál te gustó más"', () => {
    const text = buildSearchClosingQuestion(1);
    expect(text).not.toContain('Decime el número');
    expect(text).toContain('¿Te interesa?');
  });

  it('con varias fichas sí pide el número', () => {
    const text = buildSearchClosingQuestion(2);
    expect(text).toContain('¿Cuál te gustó más?');
    expect(text).toContain('Decime el número');
  });
});

describe('buildDelegatedZoneMessage', () => {
  it('junta dos sugerencias con "y"', () => {
    expect(buildDelegatedZoneMessage(['palermo', 'caballito'])).toBe(
      '¡Dale, te ayudo! Donde más opciones tenemos hoy es en *Palermo* y *Caballito*. ¿Arrancamos por ahí?',
    );
  });

  it('funciona con una sola sugerencia', () => {
    expect(buildDelegatedZoneMessage(['palermo'])).toBe(
      '¡Dale, te ayudo! Donde más opciones tenemos hoy es en *Palermo*. ¿Arrancamos por ahí?',
    );
  });
});

describe('buildPartialZoneDropMessage', () => {
  it('avisa la zona sin stock y pregunta si sigue con las que sí tienen, sin hablar de presupuesto', () => {
    const text = buildPartialZoneDropMessage(['munro'], ['caballito', 'belgrano']);
    expect(text).toBe(
      'En Munro no tenemos nada disponible por ahora 😕 ¿Te muestro lo que sí tengo en *Caballito* y *Belgrano*?',
    );
    expect(text).not.toContain('presupuesto');
  });

  it('junta varias zonas sin stock con "ni"', () => {
    expect(
      buildPartialZoneDropMessage(['munro', 'nunez'], ['caballito']),
    ).toBe(
      'En Munro ni Nunez no tenemos nada disponible por ahora 😕 ¿Te muestro lo que sí tengo en *Caballito*?',
    );
  });
});

describe('buildNoResultsMessage', () => {
  it('empty_zone delega en el mensaje de zona vacía', () => {
    expect(buildNoResultsMessage('empty_zone', ['recoleta'])).toContain(
      'no tenemos nada disponible por ahora',
    );
  });

  it('null (sin zona-filtros de por medio) es el mensaje genérico', () => {
    expect(buildNoResultsMessage(null, [])).toBe(
      'Por ahora no tengo nada que encaje con eso. ¿Querés que probemos con otra zona o cambiando algún criterio?',
    );
  });

  it('price dice honestamente que "amplié un poco" ese criterio', () => {
    expect(buildNoResultsMessage('price', ['palermo'])).toContain(
      'amplié un poco el presupuesto',
    );
  });

  it('rooms NUNCA dice "amplié un poco": el filtro se elimina del todo, no se relaja', () => {
    const text = buildNoResultsMessage('rooms', ['palermo']);
    expect(text).not.toContain('amplié un poco');
    expect(text).toBe(
      'En Palermo no tengo nada con esos ambientes, así que te muestro lo más parecido que encontré:',
    );
  });

  it('over_budget NUNCA dice "amplié un poco": es honesto sobre estar por encima', () => {
    const text = buildNoResultsMessage('over_budget', ['belgrano']);
    expect(text).not.toContain('amplié un poco');
    expect(text).toContain('por encima de tu presupuesto');
    expect(text).toContain('Belgrano');
  });
});

describe('SAME_RESULTS_MESSAGE', () => {
  it('no repite las fichas, invita a elegir o cambiar un filtro', () => {
    expect(SAME_RESULTS_MESSAGE).toContain('todas las opciones que tengo hoy');
  });
});
