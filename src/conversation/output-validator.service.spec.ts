import { OutputValidatorService } from './output-validator.service';

describe('OutputValidatorService', () => {
  const validator = new OutputValidatorService();

  it('detecta menciones de competidores (case-insensitive)', () => {
    const result = validator.sanitize(
      'Nosotros somos mejores que REMAX en la zona',
      { competitorsToAvoid: ['Remax'] },
    );
    expect(result.hadForbiddenMention).toBe(true);
  });

  it('no marca falso positivo si no hay competidores en el texto', () => {
    const result = validator.sanitize('Tenemos buenas opciones en Caballito', {
      competitorsToAvoid: ['Remax', 'Zonaprop'],
    });
    expect(result.hadForbiddenMention).toBe(false);
  });

  it('detecta fuga de datos sensibles (API keys/tokens)', () => {
    const result = validator.sanitize(
      'mi token es sk-abcdefghijklmnopqrstuvwx',
      { competitorsToAvoid: [] },
    );
    expect(result.hadSensitiveData).toBe(true);
  });

  it('trunca textos largos en el último párrafo/oración completa antes de 1200 caracteres', () => {
    const paragraph = 'Esta es una oración completa. '.repeat(60); // > 1200 chars
    const result = validator.sanitize(paragraph, { competitorsToAvoid: [] });
    expect(result.text.length).toBeLessThanOrEqual(1200);
    expect(result.text.endsWith('.')).toBe(true);
  });

  it('no toca textos cortos', () => {
    const result = validator.sanitize('Hola, ¿en qué te ayudo?', {
      competitorsToAvoid: [],
    });
    expect(result.text).toBe('Hola, ¿en qué te ayudo?');
  });

  describe('isPropertyWhitelisted', () => {
    it('acepta un id presente en lastSearchIds', () => {
      expect(
        validator.isPropertyWhitelisted('prop-1', ['prop-1', 'prop-2']),
      ).toBe(true);
    });

    it('rechaza un id que no está en lastSearchIds (mock malicioso)', () => {
      expect(
        validator.isPropertyWhitelisted('prop-inventado', ['prop-1', 'prop-2']),
      ).toBe(false);
    });
  });
});
