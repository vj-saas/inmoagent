import { hasBuyingSignal } from './buying-signals.util';

describe('hasBuyingSignal', () => {
  // AC-43: el caso exacto de H4.
  it('AC-43: detecta el caso real de H4 ("me hacen descuento si pago de contado?")', () => {
    expect(
      hasBuyingSignal(
        'en zonaprop vi uno igual a 130 mil, me hacen descuento si pago de contado?',
      ),
    ).toBe(true);
  });

  it.each([
    'me hacen descuento?',
    'pago todo de contado',
    'cuánto me lo dejás?',
    'cuanto me lo dejas',
    'el precio es negociable?',
    'tienen financiación propia?',
    'aceptan financiacion',
    'hacen permuta por mi depto?',
    'cuánto de seña hay que dejar',
    'quiero hacer la reserva',
    'reservar la propiedad',
    'cómo es el tema de la escrituración',
    'es apto crédito?',
    'se puede pagar en cuotas',
    'cuánto de anticipo piden',
  ])('detecta señal de compra en: "%s"', (text) => {
    expect(hasBuyingSignal(text)).toBe(true);
  });

  it.each([
    'busco depto en caballito',
    'hola, buenas tardes',
    'che y river cuando juega?',
    'cuántos ambientes tiene',
    'tiene cochera?',
    'a qué hora puedo visitar',
  ])('NO detecta señal de compra en texto normal de búsqueda: "%s"', (text) => {
    expect(hasBuyingSignal(text)).toBe(false);
  });
});
