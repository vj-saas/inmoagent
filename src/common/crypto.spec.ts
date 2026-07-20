import { randomBytes } from 'node:crypto';
import { decrypt, encrypt } from './crypto';

describe('crypto (AES-256-GCM)', () => {
  const key = randomBytes(32).toString('hex');
  const otherKey = randomBytes(32).toString('hex');

  it('cifra y descifra un texto haciendo round-trip', () => {
    const plaintext = 'token-secreto-de-meta-12345';

    const ciphertext = encrypt(plaintext, key);
    expect(ciphertext).not.toBe(plaintext);
    expect(decrypt(ciphertext, key)).toBe(plaintext);
  });

  it('genera un IV distinto en cada llamada (dos cifrados del mismo texto difieren)', () => {
    const plaintext = 'mismo-texto';

    expect(encrypt(plaintext, key)).not.toBe(encrypt(plaintext, key));
  });

  it('falla al descifrar con una clave incorrecta', () => {
    const ciphertext = encrypt('dato-sensible', key);

    expect(() => decrypt(ciphertext, otherKey)).toThrow();
  });

  it('falla al descifrar un payload alterado (auth tag no matchea)', () => {
    const ciphertext = encrypt('dato-sensible', key);
    const [iv, authTag, data] = ciphertext.split(':');
    const tampered = `${iv}:${authTag}:${data.slice(0, -2)}ff`;

    expect(() => decrypt(tampered, key)).toThrow();
  });
});
