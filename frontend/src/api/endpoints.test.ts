import { afterEach, describe, expect, it, vi } from 'vitest';

const requestMock = vi.fn().mockResolvedValue({});

vi.mock('./http-client', () => ({
  request: (...args: unknown[]) => requestMock(...args),
}));

import {
  createNote,
  createPerson,
  createProperty,
  deactivatePerson,
  getLead,
  getLeadMessages,
  getLeadNotes,
  getMe,
  getMetrics,
  getProperty,
  listAssignableUsers,
  listLeads,
  listPeople,
  listProperties,
  login,
  logout,
  markContacted,
  markUncontacted,
  optOutLead,
  patchAssignment,
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

  it('listLeads: GET /admin/tenants/:tenantId/leads con query string (state como array de un elemento)', async () => {
    await listLeads('t1', { state: ['QUALIFICATION'], page: 2 }, 'tok');
    expect(requestMock).toHaveBeenCalledWith(
      '/admin/tenants/t1/leads?state=QUALIFICATION&page=2',
      { method: 'GET', token: 'tok' },
    );
  });

  it('listLeads: state con múltiples valores se serializa como parámetros repetidos, no CSV ni array', async () => {
    await listLeads(
      't1',
      { state: ['QUALIFICATION', 'SCHEDULING'] as const as ('QUALIFICATION' | 'SCHEDULING')[] },
      'tok',
    );
    const [url] = requestMock.mock.calls[0] as [string, unknown];
    expect(url).toBe('/admin/tenants/t1/leads?state=QUALIFICATION&state=SCHEDULING');
    // No debe aparecer como valor único separado por comas ni como "[object Object]".
    expect(url).not.toContain('QUALIFICATION,SCHEDULING');
  });

  it('listLeads: q se serializa como parámetro de búsqueda libre', async () => {
    await listLeads('t1', { q: 'perez' }, 'tok');
    expect(requestMock).toHaveBeenCalledWith('/admin/tenants/t1/leads?q=perez', {
      method: 'GET',
      token: 'tok',
    });
  });

  it('listLeads: sin query params no agrega "?"', async () => {
    await listLeads('t1', {}, 'tok');
    expect(requestMock).toHaveBeenCalledWith('/admin/tenants/t1/leads', {
      method: 'GET',
      token: 'tok',
    });
  });

  it('getLead: GET /admin/tenants/:tenantId/leads/:leadId', async () => {
    await getLead('t1', 'l1', 'tok');
    expect(requestMock).toHaveBeenCalledWith('/admin/tenants/t1/leads/l1', {
      method: 'GET',
      token: 'tok',
    });
  });

  // ConversationState solo acepta los valores reales del enum Prisma
  // (GREETING | QUALIFICATION | SEARCH_MATCH | SCHEDULING | HUMAN_HANDOFF |
  // OPTED_OUT). Los valores inventados del stub previo (SEARCH, PRESENTING,
  // CLOSED) ya no existen: lo siguiente no debe compilar si se descomenta:
  // await listLeads('t1', { state: ['CLOSED'] }, 'tok');

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

  it('createNote: POST /admin/tenants/:tenantId/leads/:leadId/notes con body', async () => {
    await createNote('t1', 'l1', 'texto de la nota', 'tok');
    expect(requestMock).toHaveBeenCalledWith('/admin/tenants/t1/leads/l1/notes', {
      method: 'POST',
      body: { body: 'texto de la nota' },
      token: 'tok',
    });
  });

  it('getLeadNotes: GET /admin/tenants/:tenantId/leads/:leadId/notes', async () => {
    await getLeadNotes('t1', 'l1', 'tok');
    expect(requestMock).toHaveBeenCalledWith('/admin/tenants/t1/leads/l1/notes', {
      method: 'GET',
      token: 'tok',
    });
  });

  it('markContacted: POST /admin/tenants/:tenantId/leads/:leadId/contacted', async () => {
    await markContacted('t1', 'l1', 'tok');
    expect(requestMock).toHaveBeenCalledWith('/admin/tenants/t1/leads/l1/contacted', {
      method: 'POST',
      token: 'tok',
    });
  });

  it('markUncontacted: POST /admin/tenants/:tenantId/leads/:leadId/uncontacted', async () => {
    await markUncontacted('t1', 'l1', 'tok');
    expect(requestMock).toHaveBeenCalledWith('/admin/tenants/t1/leads/l1/uncontacted', {
      method: 'POST',
      token: 'tok',
    });
  });

  it('optOutLead: POST /admin/tenants/:tenantId/leads/:leadId/opt-out', async () => {
    await optOutLead('t1', 'l1', 'tok');
    expect(requestMock).toHaveBeenCalledWith('/admin/tenants/t1/leads/l1/opt-out', {
      method: 'POST',
      token: 'tok',
    });
  });

  it('patchAssignment: PATCH /admin/tenants/:tenantId/leads/:leadId/assignment con body parcial', async () => {
    await patchAssignment('t1', 'l1', { assignedUserId: null }, 'tok');
    expect(requestMock).toHaveBeenCalledWith('/admin/tenants/t1/leads/l1/assignment', {
      method: 'PATCH',
      body: { assignedUserId: null },
      token: 'tok',
    });
  });

  it('listAssignableUsers: GET /admin/tenants/:tenantId/people/assignable', async () => {
    await listAssignableUsers('t1', 'tok');
    expect(requestMock).toHaveBeenCalledWith('/admin/tenants/t1/people/assignable', {
      method: 'GET',
      token: 'tok',
    });
  });
});
