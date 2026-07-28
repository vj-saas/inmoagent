import type { Tenant } from '@prisma/client';

import {
  buildDayPreferenceQuestion,
  buildDelegatedZoneMessage,
  buildGreetingMessage,
  buildHandoffFarewell,
  buildMissingFilterFallback,
  buildNoResultsMessage,
  buildOffTopicRedirectFallback,
  buildPartialZoneDropMessage,
  buildReformulateRequest,
  buildSameResultsMessage,
  buildSchedulingHandoffMessage,
  buildSearchClosingQuestion,
  buildSearchIntro,
  buildTeaserClosingQuestion,
  buildTeaserIntro,
  buildZoneStillPendingMessage,
  DEFAULT_HANDOFF_INTRO,
  DEFAULT_INTRO,
  OPERATION_QUESTION,
} from './templates';

/** Cuenta signos de pregunta en un texto (AC-8: máx. uno por mensaje, salvo teaser). */
function countQuestionMarks(text: string): number {
  return (text.match(/\?/g) ?? []).length;
}

/** Genera N seeds distintos para un mismo lead (turnos consecutivos), para
 * recorrer el pool completo de variantes en los tests (spec 09, T2.2 AC-5). */
function seedsFor(leadId: string, count = 12): string[] {
  return Array.from({ length: count }, (_, turn) => `${leadId}:${turn}`);
}

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
  it('con una sola ficha, NINGUNA variante pide "el número" (excepción de una sola pregunta)', () => {
    for (const seed of seedsFor('lead-1')) {
      const text = buildSearchClosingQuestion(1, seed);
      expect(text).not.toContain('Decime el número');
      expect(text).toMatch(/¿Te (interesa|copó esta|cierra esta)/);
    }
  });

  it('con varias fichas, TODAS las variantes piden el número', () => {
    for (const seed of seedsFor('lead-2')) {
      const text = buildSearchClosingQuestion(2, seed);
      expect(text).toMatch(/número/);
    }
  });

  it('varía entre turnos consecutivos del mismo lead', () => {
    const outputs = new Set(
      seedsFor('lead-3').map((seed) => buildSearchClosingQuestion(2, seed)),
    );
    expect(outputs.size).toBeGreaterThan(1);
  });

  it('es determinístico: mismo seed, mismo texto', () => {
    expect(buildSearchClosingQuestion(1, 'lead-4:2')).toBe(
      buildSearchClosingQuestion(1, 'lead-4:2'),
    );
  });

  // AC-7 / AC-8 (spec 09, T2.3): la pregunta de día NO va acá — se pregunta
  // recién al confirmar interés, vía buildDayPreferenceQuestion.
  it('AC-8: ninguna variante (count 1 o varios) tiene más de un signo "?"', () => {
    for (const seed of seedsFor('lead-14')) {
      expect(countQuestionMarks(buildSearchClosingQuestion(1, seed))).toBeLessThanOrEqual(1);
      expect(countQuestionMarks(buildSearchClosingQuestion(2, seed))).toBeLessThanOrEqual(1);
    }
  });

  it('AC-7: ninguna variante menciona "entre semana" ni "sábado" (eso se pregunta después)', () => {
    for (const seed of seedsFor('lead-15')) {
      expect(buildSearchClosingQuestion(1, seed)).not.toMatch(/entre semana|sábado/i);
      expect(buildSearchClosingQuestion(2, seed)).not.toMatch(/entre semana|sábado/i);
    }
  });
});

describe('buildDayPreferenceQuestion', () => {
  it('AC-7: todas las variantes preguntan entre semana o sábado, con un solo "?"', () => {
    for (const seed of seedsFor('lead-16')) {
      const text = buildDayPreferenceQuestion(seed);
      expect(text).toMatch(/entre semana/i);
      expect(text).toMatch(/sábado/i);
      expect(countQuestionMarks(text)).toBe(1);
    }
  });
});

describe('buildSearchIntro', () => {
  it('varía entre turnos y siempre introduce opciones', () => {
    const outputs = seedsFor('lead-5').map((seed) => buildSearchIntro(seed));
    expect(new Set(outputs).size).toBeGreaterThan(1);
    for (const text of outputs) {
      expect(text).toMatch(/opciones|disponible|mostrarte|encontr/i);
    }
  });
});

describe('buildSameResultsMessage', () => {
  it('todas las variantes dejan en claro que ya se mostró todo el stock', () => {
    for (const seed of seedsFor('lead-6')) {
      expect(buildSameResultsMessage(seed)).toMatch(/todo|todas/i);
    }
  });
});

describe('buildReformulateRequest', () => {
  it('todas las variantes piden reformular sin culpar al lead', () => {
    for (const seed of seedsFor('lead-7')) {
      const text = buildReformulateRequest(seed);
      expect(text.length).toBeGreaterThan(0);
    }
  });
});

describe('buildOffTopicRedirectFallback', () => {
  it('todas las variantes retoman la búsqueda sin opinar del tema', () => {
    for (const seed of seedsFor('lead-8')) {
      const text = buildOffTopicRedirectFallback(seed);
      expect(text).toMatch(/propiedades|búsqueda/i);
    }
  });
});

describe('buildTeaserIntro', () => {
  it('todas las variantes mencionan la zona pedida', () => {
    for (const seed of seedsFor('lead-9')) {
      expect(buildTeaserIntro(['palermo'], seed)).toContain('Palermo');
    }
  });

  it('cae a "esa zona" sin barrios', () => {
    expect(buildTeaserIntro([], 'lead-10:0')).toContain('esa zona');
  });
});

describe('buildMissingFilterFallback', () => {
  it('neighborhood: todas las variantes preguntan por zona/barrio', () => {
    for (const seed of seedsFor('lead-11')) {
      expect(buildMissingFilterFallback('neighborhood', [], seed)).toMatch(
        /zona|barrio/i,
      );
    }
  });

  it('rooms: todas las variantes preguntan ambientes y citan la zona conocida', () => {
    for (const seed of seedsFor('lead-12')) {
      const text = buildMissingFilterFallback('rooms', ['caballito'], seed);
      expect(text).toMatch(/ambientes/i);
      expect(text).toContain('Caballito');
    }
  });

  it('price: todas las variantes preguntan presupuesto', () => {
    for (const seed of seedsFor('lead-13')) {
      expect(buildMissingFilterFallback('price', [], seed)).toMatch(
        /presupuesto|gastar/i,
      );
    }
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

describe('buildZoneStillPendingMessage', () => {
  it('es honesto (no repregunta la zona) y reofrece lo ya sugerido, con dos zonas', () => {
    const text = buildZoneStillPendingMessage(['palermo', 'caballito']);
    expect(text).toContain('no tenemos nada disponible');
    expect(text).toContain('*Palermo* o *Caballito*');
    expect(text).not.toMatch(/qué (zona|barrio)/i);
  });

  it('funciona con una sola zona ofrecida', () => {
    expect(buildZoneStillPendingMessage(['palermo'])).toContain('*Palermo*');
  });
});

describe('buildPartialZoneDropMessage', () => {
  it('avisa la zona sin stock y pregunta si sigue con las que sí tienen, sin hablar de presupuesto', () => {
    const text = buildPartialZoneDropMessage(
      ['munro'],
      ['caballito', 'belgrano'],
    );
    expect(text).toBe(
      'En Munro no tenemos nada disponible por ahora 😕 ¿Te muestro lo que sí tengo en *Caballito* y *Belgrano*?',
    );
    expect(text).not.toContain('presupuesto');
  });

  it('junta varias zonas sin stock con "ni"', () => {
    expect(buildPartialZoneDropMessage(['munro', 'nunez'], ['caballito'])).toBe(
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

/**
 * Guardrail Ley 25.326 (regla de negocio innegociable 5 de CLAUDE.md) +
 * `welcomeIntro`/`handoffIntro` configurables por tenant (AC-5 a AC-8 de
 * specs/V-C-onboarding-tenant).
 */

const TENANT_NAME = 'Inmobiliaria Testigo';

/**
 * La línea de privacidad escrita LITERAL, a propósito: si el test la importara
 * del código de producción, un cambio que la vaciara haría pasar el test igual.
 * Acá el test es un contrato independiente contra el que se verifica el código.
 */
const EXPECTED_PRIVACY_LINE = `_Al continuar aceptás que ${TENANT_NAME} use tus datos solo para gestionar tu consulta (Ley 25.326). Escribí BAJA cuando quieras dejar de recibir mensajes._`;

function tenantFixture(overrides: Partial<Tenant> = {}): Tenant {
  return {
    name: TENANT_NAME,
    botName: 'Sofía',
    humanHours: null,
    welcomeIntro: null,
    handoffIntro: null,
    ...overrides,
  } as Tenant;
}

describe('buildGreetingMessage — welcomeIntro configurable', () => {
  it('con welcomeIntro configurado usa ese texto Y mantiene el aviso legal (AC-5)', () => {
    const welcomeIntro =
      '¡Buenas! Somos Testigo Propiedades, 30 años en el barrio.';
    const text = buildGreetingMessage(tenantFixture({ welcomeIntro }));

    expect(text).toContain(welcomeIntro);
    expect(text).toContain('(Ley 25.326)');
    expect(text).toContain('BAJA');
    expect(text).toContain(EXPECTED_PRIVACY_LINE);
    // El texto por defecto queda reemplazado, no duplicado.
    expect(text).not.toContain('Estoy para ayudarte a encontrar');
  });

  it('con welcomeIntro configurado sigue preguntando la operación (la agrega el backend)', () => {
    const text = buildGreetingMessage(
      tenantFixture({ welcomeIntro: 'Hola, bienvenido.' }),
    );
    expect(text).toContain(OPERATION_QUESTION);
  });

  it.each([
    ['null', null],
    ['string vacío', ''],
    ['solo espacios', '   '],
  ])(
    'con welcomeIntro %s cae al texto por defecto, idéntico al de hoy (AC-6, regresión)',
    (_label, welcomeIntro) => {
      const tenant = tenantFixture({ welcomeIntro });
      const expected = `${DEFAULT_INTRO(tenant)}\n\n${OPERATION_QUESTION}\n\n${EXPECTED_PRIVACY_LINE}`;

      expect(buildGreetingMessage(tenant)).toBe(expected);
    },
  );

  it('el texto por defecto de hoy incluye el nombre del bot y de la inmobiliaria (AC-6)', () => {
    const text = buildGreetingMessage(tenantFixture());
    expect(text).toBe(
      `¡Hola! 👋 Soy Sofía, de ${TENANT_NAME}. Estoy para ayudarte a encontrar tu próxima propiedad, a cualquier hora.\n\nContame, ¿estás buscando *comprar* o *alquilar*?\n\n${EXPECTED_PRIVACY_LINE}`,
    );
  });

  /**
   * NO BORRAR: este test fija la regla de negocio innegociable 5 de CLAUDE.md.
   * Cubre valores adversarios de `welcomeIntro` (el único texto que un tenant
   * controla en el primer mensaje) y verifica que el aviso de Ley 25.326 sigue
   * presente en TODOS los casos. Parece redundante y no lo es: es la única
   * defensa automatizada contra una futura refactorización que agregue una rama
   * de retorno sin la línea legal.
   */
  describe('nunca omite el aviso Ley 25.326 sin importar el contenido de welcomeIntro (regla de negocio 5, AC-7)', () => {
    const ADVERSARIAL_INTROS: Array<[string, string]> = [
      ['string vacío', ''],
      ['solo espacios', '     '],
      ['solo tabs y saltos de línea', '\t\n\n \r\n'],
      ['exactamente 500 caracteres (el máximo del DTO)', 'a'.repeat(500)],
      ['muchos saltos de línea', 'Hola\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\nchau'],
      [
        'texto que ya menciona la Ley 25.326',
        'Al escribirnos aceptás nuestros términos (Ley 25.326), no guardamos nada.',
      ],
      ['markdown sin cerrar', '**texto sin cerrar'],
      ['markdown de itálica sin cerrar', '_intro abierta'],
      [
        'emojis y caracteres de control (NUL, zero-width space, escape ANSI)',
        '👋🏠✨\u0000\u200B\u001B[31m',
      ],
      ['solo un zero-width space, que trim() no elimina', '\u200B'],
      ['un guion bajo suelto que podría romper el formato', 'Hola_'],
      ['texto que imita el cierre del mensaje', 'Fin del mensaje.\n\n---'],
    ];

    it.each(ADVERSARIAL_INTROS)(
      'welcomeIntro %s → el mensaje sigue conteniendo el aviso legal completo',
      (_label, welcomeIntro) => {
        const text = buildGreetingMessage(tenantFixture({ welcomeIntro }));

        expect(text).toContain(EXPECTED_PRIVACY_LINE);
      },
    );
  });
});

describe('buildHandoffFarewell — handoffIntro configurable', () => {
  it('con handoffIntro y humanHours: el intro configurado y el horario DESPUÉS (AC-8)', () => {
    const handoffIntro = 'Te paso con Marcela, nuestra asesora estrella.';
    const text = buildHandoffFarewell(
      tenantFixture({ handoffIntro, humanHours: 'Lun a Vie de 9 a 18' }),
    );

    expect(text).toBe(
      `${handoffIntro} Horario de atención: Lun a Vie de 9 a 18.`,
    );
    expect(text.indexOf(handoffIntro)).toBeLessThan(
      text.indexOf('Horario de atención'),
    );
  });

  it('con handoffIntro y sin humanHours: solo el intro, sin línea de horario', () => {
    const handoffIntro = 'Te paso con Marcela.';
    const text = buildHandoffFarewell(
      tenantFixture({ handoffIntro, humanHours: null }),
    );

    expect(text).toBe(handoffIntro);
    expect(text).not.toContain('Horario de atención');
  });

  it.each([
    ['null', null],
    ['string vacío', ''],
    ['solo espacios', '  '],
  ])(
    'con handoffIntro %s usa el texto por defecto de hoy (regresión)',
    (_label, handoffIntro) => {
      const tenant = tenantFixture({ handoffIntro });

      expect(buildHandoffFarewell(tenant)).toBe(DEFAULT_HANDOFF_INTRO(tenant));
      expect(buildHandoffFarewell(tenant)).toBe(
        `¡Claro! Te dejo con un asesor de ${TENANT_NAME}, te escribe a la brevedad.`,
      );
    },
  );

  it('sin handoffIntro y con humanHours mantiene el mensaje completo de hoy (regresión)', () => {
    const text = buildHandoffFarewell(
      tenantFixture({ handoffIntro: null, humanHours: 'Sáb de 10 a 13' }),
    );

    expect(text).toBe(
      `¡Claro! Te dejo con un asesor de ${TENANT_NAME}, te escribe a la brevedad. Horario de atención: Sáb de 10 a 13.`,
    );
  });
});

describe('buildSchedulingHandoffMessage — fuera del alcance de handoffIntro', () => {
  it('handoffIntro NO afecta el handoff post-interés en una propiedad (regresión)', () => {
    const conIntro = buildSchedulingHandoffMessage(
      tenantFixture({
        handoffIntro: 'Te paso con Marcela, nuestra asesora estrella.',
        humanHours: 'Lun a Vie de 9 a 18',
      }),
    );
    const sinIntro = buildSchedulingHandoffMessage(
      tenantFixture({ handoffIntro: null, humanHours: 'Lun a Vie de 9 a 18' }),
    );

    expect(conIntro).toBe(sinIntro);
    expect(conIntro).not.toContain('Marcela');
    expect(conIntro).toBe(
      `Cuando elijas el horario en el link, un asesor de ${TENANT_NAME} se va a comunicar para confirmar la visita y contarte más opciones de la zona. Es sin compromiso y dura unos 20 minutos (horario de atención: Lun a Vie de 9 a 18).`,
    );
  });
});
