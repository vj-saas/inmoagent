import { isServiceWindowOpen } from './service-window.util';

describe('isServiceWindowOpen', () => {
  const now = new Date('2026-07-25T12:00:00.000Z');

  it('devuelve false cuando lastInboundAt es null', () => {
    expect(isServiceWindowOpen(null, now)).toBe(false);
  });

  it('devuelve true cuando lastInboundAt fue hace 23h59m (ventana abierta)', () => {
    const lastInboundAt = new Date(now.getTime() - (23 * 60 + 59) * 60 * 1000);
    expect(isServiceWindowOpen(lastInboundAt, now)).toBe(true);
  });

  it('devuelve false cuando lastInboundAt fue hace exactamente 24hs (borde cerrado)', () => {
    const lastInboundAt = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    expect(isServiceWindowOpen(lastInboundAt, now)).toBe(false);
  });

  it('devuelve false cuando lastInboundAt fue hace 25hs', () => {
    const lastInboundAt = new Date(now.getTime() - 25 * 60 * 60 * 1000);
    expect(isServiceWindowOpen(lastInboundAt, now)).toBe(false);
  });
});
