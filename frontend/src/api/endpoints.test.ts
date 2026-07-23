import { afterEach, describe, expect, it, vi } from 'vitest';

const requestMock = vi.fn().mockResolvedValue({});

vi.mock('./http-client', () => ({
  request: (...args: unknown[]) => requestMock(...args),
}));

import {
  createPerson,
  createProperty,
  deactivatePerson,
  getLeadMessages,
  getMe,
  getMetrics,
  getProperty,
  listLeads,
  listPeople,
  listProperties,
  login,
  logout,
  releaseLead,
  removeProperty,
  resetPassword,
  suppressLead,
  updateProperty,
  updatePropertyStatus,
} from './endpoints';

describe('endpoints', () => {
  afterEach(() => {
    requestMock.mockClear();
  });

  it('login: POST /auth/login con body de credenciales', async () => {
    await login('a@a.com', 'secreto123');
    expect(requestMock).toHaveBeenCalledWith('/auth/login', {
      method: 'POST',
      body: { email: 'a@a.com', password: 'secreto123' },
    });
  });

  it('logout: POST /auth/logout con token', async () => {
    await logout('tok');
    expect(requestMock).toHaveBeenCalledWith('/auth/logout', {
      method: 'POST',
      token: 'tok',
    });
  });

  it('getMe: GET /auth/me con token', async () => {
    await getMe('tok');
    expect(requestMock).toHaveBeenCalledWith('/auth/me', {
      method: 'GET',
      token: 'tok',
    });
  });

  it('listPeople: GET /admin/tenants/:tenantId/people', async () => {
    await listPeople('t1', 'tok');
    expect(requestMock).toHaveBeenCalledWith('/admin/tenants/t1/people', {
      method: 'GET',
      token: 'tok',
    });
  });

  it('createPerson: POST /admin/tenants/:tenantId/people con body', async () => {
    await createPerson('t1', { email: 'b@b.com', role: 'AGENT' }, 'tok');
    expect(requestMock).toHaveBeenCalledWith('/admin/tenants/t1/people', {
      method: 'POST',
      body: { email: 'b@b.com', role: 'AGENT' },
      token: 'tok',
    });
  });

  it('deactivatePerson: PATCH /admin/tenants/:tenantId/people/:personId/deactivate', async () => {
    await deactivatePerson('t1', 'p1', 'tok');
    expect(requestMock).toHaveBeenCalledWith('/admin/tenants/t1/people/p1/deactivate', {
      method: 'PATCH',
      token: 'tok',
    });
  });

  it('resetPassword: POST /admin/tenants/:tenantId/people/:personId/reset-password', async () => {
    await resetPassword('t1', 'p1', 'tok');
    expect(requestMock).toHaveBeenCalledWith(
      '/admin/tenants/t1/people/p1/reset-password',
      { method: 'POST', token: 'tok' },
    );
  });

  it('listLeads: GET /admin/tenants/:tenantId/leads con query string', async () => {
    await listLeads('t1', { state: 'QUALIFICATION', page: 2 }, 'tok');
    expect(requestMock).toHaveBeenCalledWith(
      '/admin/tenants/t1/leads?state=QUALIFICATION&page=2',
      { method: 'GET', token: 'tok' },
    );
  });

  it('listLeads: sin query params no agrega "?"', async () => {
    await listLeads('t1', {}, 'tok');
    expect(requestMock).toHaveBeenCalledWith('/admin/tenants/t1/leads', {
      method: 'GET',
      token: 'tok',
    });
  });

  it('getLeadMessages: GET /admin/tenants/:tenantId/leads/:leadId/messages', async () => {
    await getLeadMessages('t1', 'l1', 'tok');
    expect(requestMock).toHaveBeenCalledWith('/admin/tenants/t1/leads/l1/messages', {
      method: 'GET',
      token: 'tok',
    });
  });

  it('releaseLead: POST /admin/tenants/:tenantId/leads/:leadId/release', async () => {
    await releaseLead('t1', 'l1', 'tok');
    expect(requestMock).toHaveBeenCalledWith('/admin/tenants/t1/leads/l1/release', {
      method: 'POST',
      token: 'tok',
    });
  });

  it('suppressLead: DELETE /admin/tenants/:tenantId/leads/:leadId', async () => {
    await suppressLead('t1', 'l1', 'tok');
    expect(requestMock).toHaveBeenCalledWith('/admin/tenants/t1/leads/l1', {
      method: 'DELETE',
      token: 'tok',
    });
  });

  it('getMetrics: GET /admin/tenants/:tenantId/metrics con from/to', async () => {
    await getMetrics('t1', { from: '2026-01-01', to: '2026-01-31' }, 'tok');
    expect(requestMock).toHaveBeenCalledWith(
      '/admin/tenants/t1/metrics?from=2026-01-01&to=2026-01-31',
      { method: 'GET', token: 'tok' },
    );
  });

  it('listProperties: GET /admin/tenants/:tenantId/properties con query string', async () => {
    await listProperties('t1', { status: 'ACTIVE', operation: 'SALE', page: 1 }, 'tok');
    expect(requestMock).toHaveBeenCalledWith(
      '/admin/tenants/t1/properties?status=ACTIVE&operation=SALE&page=1',
      { method: 'GET', token: 'tok' },
    );
  });

  it('getProperty: GET /admin/tenants/:tenantId/properties/:propertyId', async () => {
    await getProperty('t1', 'p1', 'tok');
    expect(requestMock).toHaveBeenCalledWith('/admin/tenants/t1/properties/p1', {
      method: 'GET',
      token: 'tok',
    });
  });

  it('createProperty: POST /admin/tenants/:tenantId/properties con body', async () => {
    const data = {
      title: 'Depto',
      operation: 'SALE' as const,
      propertyType: 'departamento',
      price: 100000,
      neighborhood: 'Palermo',
    };
    await createProperty('t1', data, 'tok');
    expect(requestMock).toHaveBeenCalledWith('/admin/tenants/t1/properties', {
      method: 'POST',
      body: data,
      token: 'tok',
    });
  });

  it('updateProperty: PATCH /admin/tenants/:tenantId/properties/:propertyId con body parcial', async () => {
    await updateProperty('t1', 'p1', { price: 150000 }, 'tok');
    expect(requestMock).toHaveBeenCalledWith('/admin/tenants/t1/properties/p1', {
      method: 'PATCH',
      body: { price: 150000 },
      token: 'tok',
    });
  });

  it('updatePropertyStatus: PATCH /admin/tenants/:tenantId/properties/:propertyId/status', async () => {
    await updatePropertyStatus('t1', 'p1', 'PAUSED', 'tok');
    expect(requestMock).toHaveBeenCalledWith(
      '/admin/tenants/t1/properties/p1/status',
      { method: 'PATCH', body: { status: 'PAUSED' }, token: 'tok' },
    );
  });

  it('removeProperty: DELETE /admin/tenants/:tenantId/properties/:propertyId', async () => {
    await removeProperty('t1', 'p1', 'tok');
    expect(requestMock).toHaveBeenCalledWith('/admin/tenants/t1/properties/p1', {
      method: 'DELETE',
      token: 'tok',
    });
  });
});
