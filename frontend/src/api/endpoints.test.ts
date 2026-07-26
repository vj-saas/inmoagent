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
  sendManualMessage,
  suppressLead,
  updateProperty,
  updatePropertyStatus,
  uploadPropertyPhoto,
  type MetricsResult,
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

  it('sendManualMessage: POST /admin/tenants/:tenantId/leads/:leadId/send con body de texto', async () => {
    await sendManualMessage('t1', 'l1', 'Hola, te escribe un asesor', 'tok');
    expect(requestMock).toHaveBeenCalledWith('/admin/tenants/t1/leads/l1/send', {
      method: 'POST',
      body: { text: 'Hola, te escribe un asesor' },
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

  it('getMetrics: retorna Promise<MetricsResult> con tipado correcto de campos anidados', async () => {
    const mockResult: MetricsResult = {
      range: { from: '2026-01-01T00:00:00.000Z', to: '2026-01-31T23:59:59.999Z' },
      newLeads: 10,
      activeConversations: 5,
      handoffs: 2,
      appointments: { proposed: 3, confirmed: 1 },
    };
    requestMock.mockResolvedValueOnce(mockResult);

    const result = await getMetrics('t1', { from: '2026-01-01', to: '2026-01-31' }, 'tok');

    // Verificar acceso a campos anidados sin error de TS
    expect(result.appointments.proposed).toBe(3);
    expect(result.appointments.confirmed).toBe(1);
    expect(result.newLeads).toBe(10);
    expect(result.activeConversations).toBe(5);
    expect(result.handoffs).toBe(2);
    expect(result.range.from).toBe('2026-01-01T00:00:00.000Z');
    expect(result.range.to).toBe('2026-01-31T23:59:59.999Z');
  });

  it('listProperties: GET /admin/tenants/:tenantId/properties con query string', async () => {
    await listProperties('t1', { status: 'ACTIVE', operation: 'SALE', page: 1 }, 'tok');
    expect(requestMock).toHaveBeenCalledWith(
      '/admin/tenants/t1/properties?status=ACTIVE&operation=SALE&page=1',
      { method: 'GET', token: 'tok' },
    );
  });

  it('listProperties: serializa los 5 filtros nuevos (T9) y omite los vacíos', async () => {
    await listProperties(
      't1',
      { neighborhood: 'Palermo', minPrice: 100000, maxPrice: 200000, rooms: 2, q: 'luminoso' },
      'tok',
    );
    expect(requestMock).toHaveBeenCalledWith(
      '/admin/tenants/t1/properties?neighborhood=Palermo&minPrice=100000&maxPrice=200000&rooms=2&q=luminoso',
      { method: 'GET', token: 'tok' },
    );
  });

  it('listProperties: omite status/operation/neighborhood/precios/rooms/q vacíos', async () => {
    await listProperties('t1', {}, 'tok');
    expect(requestMock).toHaveBeenCalledWith('/admin/tenants/t1/properties', {
      method: 'GET',
      token: 'tok',
    });
  });

  it('listProperties: mapea la respuesta cruda `{ properties }` del backend a `{ items }`', async () => {
    requestMock.mockResolvedValueOnce({
      properties: [{ id: 'p1' }],
      total: 1,
      page: 1,
      pageSize: 20,
    });
    const result = await listProperties('t1', {}, 'tok');
    expect(result.items).toEqual([{ id: 'p1' }]);
    expect(result.total).toBe(1);
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

// ---------------------------------------------------------------------------
// admin/tenants/:tenantId/appointments (spec B.2 — todavia no implementado)
// ---------------------------------------------------------------------------

import {
  cancelAppointment,
  confirmAppointment,
  listAppointments,
  markAppointmentDone,
  markAppointmentNoShow,
  rescheduleAppointment,
} from './endpoints';

describe('endpoints — appointments (B.2)', () => {
  afterEach(() => {
    requestMock.mockClear();
  });

  // AC-1
  it('listAppointments: GET /admin/tenants/:tenantId/appointments con rango from/to', async () => {
    await listAppointments(
      't1',
      { from: '2026-07-24T00:00:00.000Z', to: '2026-07-31T23:59:59.999Z' },
      'tok',
    );
    expect(requestMock).toHaveBeenCalledWith(
      '/admin/tenants/t1/appointments?from=2026-07-24T00%3A00%3A00.000Z&to=2026-07-31T23%3A59%3A59.999Z',
      { method: 'GET', token: 'tok' },
    );
  });

  // AC-3
  it('listAppointments: status se serializa como parametros repetidos, no CSV', async () => {
    await listAppointments(
      't1',
      { status: ['PROPOSED', 'CONFIRMED'] },
      'tok',
    );
    const [url] = requestMock.mock.calls[0] as [string, unknown];
    expect(url).toBe('/admin/tenants/t1/appointments?status=PROPOSED&status=CONFIRMED');
    expect(url).not.toContain('PROPOSED,CONFIRMED');
  });

  // AC-7
  it('confirmAppointment: POST /admin/tenants/:tenantId/appointments/:id/confirm con body', async () => {
    await confirmAppointment(
      't1',
      'a1',
      { scheduledAt: '2026-07-25T15:00:00.000Z', assignedUserId: 'u1', notes: 'trae DNI' },
      'tok',
    );
    expect(requestMock).toHaveBeenCalledWith('/admin/tenants/t1/appointments/a1/confirm', {
      method: 'POST',
      body: { scheduledAt: '2026-07-25T15:00:00.000Z', assignedUserId: 'u1', notes: 'trae DNI' },
      token: 'tok',
    });
  });

  // AC-9
  it('rescheduleAppointment: POST /admin/tenants/:tenantId/appointments/:id/reschedule con body', async () => {
    await rescheduleAppointment('t1', 'a1', { scheduledAt: '2026-07-26T10:00:00.000Z' }, 'tok');
    expect(requestMock).toHaveBeenCalledWith('/admin/tenants/t1/appointments/a1/reschedule', {
      method: 'POST',
      body: { scheduledAt: '2026-07-26T10:00:00.000Z' },
      token: 'tok',
    });
  });

  // AC-10
  it('cancelAppointment: POST /admin/tenants/:tenantId/appointments/:id/cancel con body', async () => {
    await cancelAppointment('t1', 'a1', { notes: 'lead pidio cancelar' }, 'tok');
    expect(requestMock).toHaveBeenCalledWith('/admin/tenants/t1/appointments/a1/cancel', {
      method: 'POST',
      body: { notes: 'lead pidio cancelar' },
      token: 'tok',
    });
  });

  // AC-11
  it('markAppointmentDone: POST /admin/tenants/:tenantId/appointments/:id/done con body', async () => {
    await markAppointmentDone('t1', 'a1', { outcome: 'interesado', notes: 'vuelve a llamar' }, 'tok');
    expect(requestMock).toHaveBeenCalledWith('/admin/tenants/t1/appointments/a1/done', {
      method: 'POST',
      body: { outcome: 'interesado', notes: 'vuelve a llamar' },
      token: 'tok',
    });
  });

  // AC-12
  it('markAppointmentNoShow: POST /admin/tenants/:tenantId/appointments/:id/no-show con body', async () => {
    await markAppointmentNoShow('t1', 'a1', { notes: 'no aparecio' }, 'tok');
    expect(requestMock).toHaveBeenCalledWith('/admin/tenants/t1/appointments/a1/no-show', {
      method: 'POST',
      body: { notes: 'no aparecio' },
      token: 'tok',
    });
  });
});

// ---------------------------------------------------------------------------
// admin/tenants — wizard de onboarding (spec V-C-onboarding-tenant, T11)
// ---------------------------------------------------------------------------

import {
  bootstrapOwner,
  createTenant,
  getWebhookStatus,
  importPropertiesCsv,
  updateTenantConfig,
} from './endpoints';

describe('endpoints — onboarding de tenant (V-C, T11)', () => {
  afterEach(() => {
    requestMock.mockClear();
  });

  it('createTenant: POST /admin/tenants con header X-Master-Key y body del DTO', async () => {
    const dto = {
      name: 'Inmobiliaria Test',
      slug: 'inmobiliaria-test',
      phoneNumberId: '123456',
      accessToken: 'meta-token',
    };
    await createTenant(dto, 'master-secret');
    expect(requestMock).toHaveBeenCalledWith('/admin/tenants', {
      method: 'POST',
      body: dto,
      headers: { 'X-Master-Key': 'master-secret' },
    });
  });

  it('createTenant: NO manda un token de sesión (Bearer)', async () => {
    await createTenant(
      { name: 'X', slug: 'x', phoneNumberId: '1', accessToken: 'tok' },
      'master-secret',
    );
    const [, options] = requestMock.mock.calls[0] as [string, Record<string, unknown>];
    expect(options.token).toBeUndefined();
  });

  it('bootstrapOwner: POST /admin/tenants/:tenantId/people/bootstrap-owner con header X-Master-Key', async () => {
    await bootstrapOwner('t1', { email: 'owner@a.com', password: 'secreto123' }, 'master-secret');
    expect(requestMock).toHaveBeenCalledWith(
      '/admin/tenants/t1/people/bootstrap-owner',
      {
        method: 'POST',
        body: { email: 'owner@a.com', password: 'secreto123' },
        headers: { 'X-Master-Key': 'master-secret' },
      },
    );
  });

  it('importPropertiesCsv: POST /admin/tenants/:tenantId/properties/import con FormData (no JSON)', async () => {
    const file = new File(['col1,col2\na,b'], 'inventario.csv', { type: 'text/csv' });
    await importPropertiesCsv('t1', file, 'tok');

    expect(requestMock).toHaveBeenCalledTimes(1);
    const [url, options] = requestMock.mock.calls[0] as [string, Record<string, unknown>];
    expect(url).toBe('/admin/tenants/t1/properties/import');
    expect(options.method).toBe('POST');
    expect(options.token).toBe('tok');
    expect(options.body).toBeInstanceOf(FormData);
    expect((options.body as FormData).get('file')).toBe(file);
  });

  it('uploadPropertyPhoto: POST /admin/tenants/:tenantId/properties/photos con FormData (no JSON)', async () => {
    const file = new File(['binario'], 'foto.jpg', { type: 'image/jpeg' });
    await uploadPropertyPhoto('t1', file, 'tok');

    expect(requestMock).toHaveBeenCalledTimes(1);
    const [url, options] = requestMock.mock.calls[0] as [string, Record<string, unknown>];
    expect(url).toBe('/admin/tenants/t1/properties/photos');
    expect(options.method).toBe('POST');
    expect(options.token).toBe('tok');
    expect(options.headers).toBeUndefined();
    expect(options.body).toBeInstanceOf(FormData);
    expect((options.body as FormData).get('file')).toBe(file);
  });

  it('updateTenantConfig: PATCH /admin/tenants/:tenantId/config con body parcial y token de sesión', async () => {
    await updateTenantConfig('t1', { botName: 'Marta' }, 'tok');
    expect(requestMock).toHaveBeenCalledWith('/admin/tenants/t1/config', {
      method: 'PATCH',
      body: { botName: 'Marta' },
      token: 'tok',
    });
  });

  it('getWebhookStatus: GET /admin/tenants/:tenantId/webhook-status con token de sesión', async () => {
    await getWebhookStatus('t1', 'tok');
    expect(requestMock).toHaveBeenCalledWith('/admin/tenants/t1/webhook-status', {
      method: 'GET',
      token: 'tok',
    });
  });
});
