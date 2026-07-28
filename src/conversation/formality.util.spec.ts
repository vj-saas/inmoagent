import { applyFormality } from './formality.util';

describe('applyFormality', () => {
  // AC-10: default 'cercano' se comporta exactamente igual que hoy.
  it('con "cercano" devuelve el texto sin tocar', () => {
    const text = '¡Hola! 👋 ¿Cómo va?';
    expect(applyFormality(text, 'cercano')).toBe(text);
  });

  it('con un valor desconocido (undefined/otro) no toca el texto (fail-safe)', () => {
    const text = '¡Hola! 👋';
    expect(applyFormality(text, 'otra-cosa')).toBe(text);
  });

  // AC-9: en "formal" no quedan emojis.
  it('con "formal" saca los emojis', () => {
    const text = 'Perfecto, Caballito 👌 ¿Cuántos ambientes necesitás?';
    const result = applyFormality(text, 'formal');
    expect(result).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('con "formal" colapsa el espacio doble que deja un emoji en medio de la oración', () => {
    const text = 'En Bernal no tenemos nada disponible por ahora 😕 ¿Buscamos otra zona?';
    const result = applyFormality(text, 'formal');
    expect(result).not.toContain('  ');
    expect(result).toBe(
      'En Bernal no tenemos nada disponible por ahora ¿Buscamos otra zona?',
    );
  });

  // AC-11 / AC-9: muletillas de la lista cerrada, al inicio del mensaje.
  it('con "formal" saca "¡Jaja, " del inicio y capitaliza lo que sigue', () => {
    const text = '¡Jaja, me encantaría, pero de eso no sé nada!';
    expect(applyFormality(text, 'formal')).toBe(
      'Me encantaría, pero de eso no sé nada!',
    );
  });

  it('con "formal" saca "¡Dale, " del inicio', () => {
    const text = '¡Dale, te ayudo! Donde más opciones tenemos es en Palermo.';
    expect(applyFormality(text, 'formal')).toBe(
      'Te ayudo! Donde más opciones tenemos es en Palermo.',
    );
  });

  it('con "formal" saca "Genial, " y "Buenísimo, " del inicio', () => {
    expect(applyFormality('Genial, para arrancar contame la zona.', 'formal')).toBe(
      'Para arrancar contame la zona.',
    );
    expect(applyFormality('¡Buenísimo! Para arrancar...', 'formal')).toBe(
      'Para arrancar...',
    );
  });

  it('con "formal" no toca "genial"/"dale" si NO están al inicio de la oración', () => {
    const text = 'Esta zona tiene onda, dale que seguimos.';
    expect(applyFormality(text, 'formal')).toBe(text);
  });

  it('con "formal" nunca toca el aviso Ley 25.326 (no tiene emojis ni muletillas)', () => {
    const privacyLine =
      '_Al continuar aceptás que Inmobiliaria X use tus datos solo para gestionar tu consulta (Ley 25.326). Escribí BAJA cuando quieras dejar de recibir mensajes._';
    expect(applyFormality(privacyLine, 'formal')).toBe(privacyLine);
  });
});
