import {
  generateSessionToken,
  hashSessionToken,
} from './session-token.util';

describe('session-token.util', () => {
  it('genera un token opaco de 256 bits (64 hex) y su hash sha256', () => {
    const { token, tokenHash } = generateSessionToken();

    expect(token).toMatch(/^[a-f0-9]{64}$/); // 32 bytes en hex
    expect(tokenHash).toMatch(/^[a-f0-9]{64}$/); // sha256 en hex
  });

  it('el token en claro nunca es igual a su hash', () => {
    const { token, tokenHash } = generateSessionToken();

    expect(token).not.toBe(tokenHash);
  });

  it('el hash coincide con sha256(token) del util', () => {
    const { token, tokenHash } = generateSessionToken();

    expect(hashSessionToken(token)).toBe(tokenHash);
  });

  it('hashSessionToken es determinístico (mismo token, mismo hash)', () => {
    const { token } = generateSessionToken();

    expect(hashSessionToken(token)).toBe(hashSessionToken(token));
  });

  it('genera tokens distintos en llamadas sucesivas', () => {
    const a = generateSessionToken();
    const b = generateSessionToken();

    expect(a.token).not.toBe(b.token);
    expect(a.tokenHash).not.toBe(b.tokenHash);
  });
});
