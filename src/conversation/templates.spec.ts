import type { Tenant } from '@prisma/client';

import {
  buildDelegatedZoneMessage,
  buildGreetingMessage,
  buildHandoffFarewell,
  buildNoResultsMessage,
  buildPartialZoneDropMessage,
  buildSchedulingHandoffMessage,
  buildSearchClosingQuestion,
  buildTeaserClosingQuestion,
  DEFAULT_HANDOFF_INTRO,
  DEFAULT_INTRO,
  OPERATION_QUESTION,
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

describe('SAME_RESULTS_MESSAGE', () => {
  it('no repite las fichas, invita a elegir o cambiar un filtro', () => {
    expect(SAME_RESULTS_MESSAGE).toContain('todas las opciones que tengo hoy');
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
      `¡Genial! La visita es sin compromiso y dura unos 20 minutos. Te dejo con un asesor de ${TENANT_NAME}, que conoce la propiedad y te puede mostrar más opciones de la zona en la misma salida. Te escribe a la brevedad (horario de atención: Lun a Vie de 9 a 18).`,
    );
  });
});
