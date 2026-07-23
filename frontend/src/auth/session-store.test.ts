import { beforeEach, describe, expect, it } from 'vitest';
import { clearSession, getSession, setSession, type Session } from './session-store';

const sampleSession: Session = {
  token: 'abc123',
  role: 'OWNER',
  tenantId: 'tenant-1',
  email: 'owner@example.com',
};

describe('session-store', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('setSession guarda y getSession lo recupera con el shape correcto', () => {
    setSession(sampleSession);

    expect(getSession()).toEqual(sampleSession);
  });

  it('clearSession borra la sesion persistida', () => {
    setSession(sampleSession);
    clearSession();

    expect(getSession()).toBeNull();
  });

  it('getSession sin sesion previa devuelve null', () => {
    expect(getSession()).toBeNull();
  });

  it('JSON corrupto en sessionStorage no crashea y devuelve null', () => {
    sessionStorage.setItem('agente-inmo:session', '{not-valid-json');

    expect(() => getSession()).not.toThrow();
    expect(getSession()).toBeNull();
  });

  it('un objeto valido pero con shape incorrecto devuelve null', () => {
    sessionStorage.setItem('agente-inmo:session', JSON.stringify({ foo: 'bar' }));

    expect(getSession()).toBeNull();
  });
});
