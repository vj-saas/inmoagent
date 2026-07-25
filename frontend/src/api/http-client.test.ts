import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ConflictError,
  ForbiddenError,
  NetworkError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
  onUnauthorized,
  request,
} from './http-client';

function mockFetchOnce(response: Partial<Response> & { json?: () => Promise<unknown> }) {
  const fetchMock = vi.fn().mockResolvedValue(response as Response);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('http-client', () => {
  beforeEach(() => {
    onUnauthorized(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('devuelve los datos parseados en una request exitosa', async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: async () => ({ id: '1', name: 'Test' }),
    });

    const result = await request('/tenants/1', { token: 'abc123' });

    expect(result).toEqual({ id: '1', name: 'Test' });
  });

  it('agrega el header Authorization cuando se pasa token', async () => {
    const fetchMock = mockFetchOnce({
      ok: true,
      status: 200,
      json: async () => ({}),
    });

    await request('/leads', { token: 'my-token' });

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers.Authorization).toBe('Bearer my-token');
  });

  it('no agrega Authorization cuando no se pasa token', async () => {
    const fetchMock = mockFetchOnce({
      ok: true,
      status: 200,
      json: async () => ({}),
    });

    await request('/auth/login', { method: 'POST', body: { email: 'a@a.com' } });

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers.Authorization).toBeUndefined();
  });

  it('dispara el callback registrado y lanza UnauthorizedError ante un 401', async () => {
    const callback = vi.fn();
    onUnauthorized(callback);
    mockFetchOnce({ ok: false, status: 401, json: async () => ({}) });

    await expect(request('/admin/leads')).rejects.toBeInstanceOf(UnauthorizedError);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('mapea 403 a ForbiddenError', async () => {
    mockFetchOnce({ ok: false, status: 403, json: async () => ({}) });

    await expect(request('/admin/leads')).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('mapea 404 a NotFoundError', async () => {
    mockFetchOnce({ ok: false, status: 404, json: async () => ({}) });

    await expect(request('/admin/leads/999')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('mapea 400 a ValidationError con el detalle del backend', async () => {
    const details = { errors: ['email must be an email'] };
    mockFetchOnce({ ok: false, status: 400, json: async () => details });

    try {
      await request('/auth/login', { method: 'POST', body: {} });
      throw new Error('debería haber lanzado ValidationError');
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).details).toEqual(details);
    }
  });

  it('mapea 409 a ConflictError con el mensaje real del backend', async () => {
    mockFetchOnce({
      ok: false,
      status: 409,
      json: async () => ({ statusCode: 409, message: 'Ya existe una persona con ese email.', error: 'Conflict' }),
    });

    try {
      await request('/admin/tenants/t1/people', { method: 'POST', body: {} });
      throw new Error('debería haber lanzado ConflictError');
    } catch (error) {
      expect(error).toBeInstanceOf(ConflictError);
      expect((error as ConflictError).message).toBe('Ya existe una persona con ese email.');
    }
  });

  it('propaga el mensaje real del backend en 401/403 en vez de un texto fijo', async () => {
    mockFetchOnce({ ok: false, status: 401, json: async () => ({ message: 'Credenciales inválidas' }) });

    try {
      await request('/auth/login', { method: 'POST', body: {} });
      throw new Error('debería haber lanzado UnauthorizedError');
    } catch (error) {
      expect(error).toBeInstanceOf(UnauthorizedError);
      expect((error as UnauthorizedError).message).toBe('Credenciales inválidas');
    }
  });

  it('usa el mensaje por defecto cuando el body no trae message', async () => {
    mockFetchOnce({ ok: false, status: 403, json: async () => ({}) });

    try {
      await request('/admin/leads');
      throw new Error('debería haber lanzado ForbiddenError');
    } catch (error) {
      expect(error).toBeInstanceOf(ForbiddenError);
      expect((error as ForbiddenError).message).toBe('No tenés permisos para realizar esta acción.');
    }
  });

  it('no setea Content-Type y envía el FormData tal cual cuando el body es FormData', async () => {
    const fetchMock = mockFetchOnce({
      ok: true,
      status: 200,
      json: async () => ({}),
    });

    const formData = new FormData();
    formData.append('file', new Blob(['a,b,c'], { type: 'text/csv' }), 'test.csv');

    await request('/admin/properties/import', { method: 'POST', body: formData, token: 'abc123' });

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers['Content-Type']).toBeUndefined();
    expect(init.headers.Authorization).toBe('Bearer abc123');
    expect(init.body).toBe(formData);
  });

  it('sigue serializando un body plano con JSON.stringify y Content-Type application/json (regresión)', async () => {
    const fetchMock = mockFetchOnce({
      ok: true,
      status: 200,
      json: async () => ({}),
    });

    await request('/leads', { method: 'POST', body: { name: 'Test' } });

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(init.body).toBe(JSON.stringify({ name: 'Test' }));
  });

  it('mapea un fallo de red a NetworkError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
    );

    await expect(request('/admin/leads')).rejects.toBeInstanceOf(NetworkError);
  });
});
