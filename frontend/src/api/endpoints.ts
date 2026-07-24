/**
 * Funciones tipadas de la API sobre `http-client`.
 *
 * Cada función arma la URL y el método HTTP correspondientes al endpoint del
 * backend y delega en `request()` el manejo de errores/headers/token. Este
 * módulo no conoce sessionStorage: quien invoca decide qué `token` pasar
 * (ver `auth/session-store.ts` / `auth/AuthContext.tsx`).
 *
 * Tipos de request/response calcados de los DTOs y controllers reales del
 * backend (ver `src/auth/*`, `src/admin/leads`, `src/admin/metrics`,
 * `src/admin/properties`) — no se inventan campos que el backend no devuelve.
 */

import { request } from './http-client';

// ---------------------------------------------------------------------------
// auth (src/auth/auth.controller.ts)
// ---------------------------------------------------------------------------

export type PersonRole = 'OWNER' | 'AGENT';

export interface LoginResponse {
  token: string;
}

export interface MeResponse {
  id: string;
  role: PersonRole;
  tenantId: string;
  email: string;
}

export function login(email: string, password: string): Promise<LoginResponse> {
  return request<LoginResponse>('/auth/login', {
    method: 'POST',
    body: { email, password },
  });
}

export function logout(token: string): Promise<{ ok: true }> {
  return request<{ ok: true }>('/auth/logout', {
    method: 'POST',
    token,
  });
}

export function getMe(token: string): Promise<MeResponse> {
  return request<MeResponse>('/auth/me', {
    method: 'GET',
    token,
  });
}

// ---------------------------------------------------------------------------
// admin/tenants/:tenantId/people (src/auth/admin-people.controller.ts)
// ---------------------------------------------------------------------------

export interface PersonResponse {
  id: string;
  tenantId: string;
  email: string;
  role: PersonRole;
  active: boolean;
}

export interface PersonResponseWithTemporaryPassword extends PersonResponse {
  temporaryPassword: string;
}

export interface CreatePersonRequest {
  email: string;
  role: PersonRole;
  /** Opcional: si no se provee, el backend genera una contraseña temporal. */
  password?: string;
}

export function listPeople(tenantId: string, token: string): Promise<{ people: PersonResponse[] }> {
  return request<{ people: PersonResponse[] }>(`/admin/tenants/${tenantId}/people`, {
    method: 'GET',
    token,
  });
}

export function createPerson(
  tenantId: string,
  data: CreatePersonRequest,
  token: string,
): Promise<PersonResponse | PersonResponseWithTemporaryPassword> {
  return request<PersonResponse | PersonResponseWithTemporaryPassword>(
    `/admin/tenants/${tenantId}/people`,
    {
      method: 'POST',
      body: data,
      token,
    },
  );
}

export function deactivatePerson(
  tenantId: string,
  personId: string,
  token: string,
): Promise<PersonResponse> {
  return request<PersonResponse>(`/admin/tenants/${tenantId}/people/${personId}/deactivate`, {
    method: 'PATCH',
    token,
  });
}

export function resetPassword(
  tenantId: string,
  personId: string,
  token: string,
): Promise<PersonResponseWithTemporaryPassword> {
  return request<PersonResponseWithTemporaryPassword>(
    `/admin/tenants/${tenantId}/people/${personId}/reset-password`,
    {
      method: 'POST',
      token,
    },
  );
}

// ---------------------------------------------------------------------------
// admin/tenants/:tenantId/leads (src/admin/leads/admin-leads.controller.ts)
// TODO(A.3): tipar Lead/Message reales cuando se consuma desde pantallas.
// ---------------------------------------------------------------------------

// Calcado de `enum ConversationState` en prisma/schema.prisma. No agregar
// valores que el backend no defina (ver spec A.3).
export type ConversationState =
  | 'GREETING'
  | 'QUALIFICATION'
  | 'SEARCH_MATCH'
  | 'SCHEDULING'
  | 'HUMAN_HANDOFF'
  | 'OPTED_OUT';

// El enum `OperationType` de propiedades no incluye TEMP_RENT (solo aplica a
// alquileres tradicionales/venta); fOperation de Lead sí puede traer los tres
// valores reales del enum Prisma. Tipo propio para no mentir sobre los
// valores posibles de este campo.
export type LeadOperationType = 'SALE' | 'RENT' | 'TEMP_RENT';

// Calcado del modelo `Lead` en prisma/schema.prisma.
export interface Lead {
  id: string;
  tenantId: string;
  phone: string;
  name: string | null;
  state: ConversationState;
  fOperation: LeadOperationType | null;
  fNeighborhoods: string[];
  fMaxPrice: string | null;
  fCurrency: string | null;
  fMinRooms: number | null;
  fGarage: boolean | null;
  fPetsAllowed: boolean | null;
  fNotes: string | null;
  fPreferredDay: string | null;
  fOfferedNeighborhoods: string[];
  fPriceMentionedAtTurn: number | null;
  handoffAt: string | null;
  optedOutAt: string | null;
  lastMessageAt: string | null;
  greetedAt: string | null;
  lastSearchIds: string[];
  turnCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ListLeadsQuery {
  q?: string;
  state?: ConversationState[];
  page?: number;
}

export interface ListLeadsResponse {
  leads: unknown[];
  total: number;
  page: number;
  pageSize: number;
}

export function listLeads(
  tenantId: string,
  query: ListLeadsQuery,
  token: string,
): Promise<ListLeadsResponse> {
  const params = new URLSearchParams();
  if (query.q) params.set('q', query.q);
  if (query.state) {
    for (const s of query.state) params.append('state', s);
  }
  if (query.page) params.set('page', String(query.page));
  const qs = params.toString();
  // TODO(A.3): implementar consumo real en la pantalla de leads.
  return request<ListLeadsResponse>(
    `/admin/tenants/${tenantId}/leads${qs ? `?${qs}` : ''}`,
    { method: 'GET', token },
  );
}

export function getLead(tenantId: string, leadId: string, token: string): Promise<Lead> {
  return request<Lead>(`/admin/tenants/${tenantId}/leads/${leadId}`, {
    method: 'GET',
    token,
  });
}

export function getLeadMessages(
  tenantId: string,
  leadId: string,
  token: string,
): Promise<{ lead: unknown; messages: unknown[] }> {
  // TODO(A.3): implementar consumo real en la pantalla de leads.
  return request<{ lead: unknown; messages: unknown[] }>(
    `/admin/tenants/${tenantId}/leads/${leadId}/messages`,
    { method: 'GET', token },
  );
}

export function releaseLead(
  tenantId: string,
  leadId: string,
  token: string,
): Promise<{ released: true }> {
  // TODO(A.3): implementar consumo real en la pantalla de leads.
  return request<{ released: true }>(`/admin/tenants/${tenantId}/leads/${leadId}/release`, {
    method: 'POST',
    token,
  });
}

export function suppressLead(
  tenantId: string,
  leadId: string,
  token: string,
): Promise<{ deleted: true }> {
  // TODO(A.3): implementar consumo real en la pantalla de leads.
  return request<{ deleted: true }>(`/admin/tenants/${tenantId}/leads/${leadId}`, {
    method: 'DELETE',
    token,
  });
}

// ---------------------------------------------------------------------------
// admin/tenants/:tenantId/metrics (src/admin/metrics/admin-metrics.controller.ts)
// TODO(A.4): tipar MetricsResult real cuando se consuma desde pantallas.
// ---------------------------------------------------------------------------

export interface MetricsQuery {
  from: string;
  to: string;
}

export function getMetrics(
  tenantId: string,
  query: MetricsQuery,
  token: string,
): Promise<unknown> {
  const params = new URLSearchParams({ from: query.from, to: query.to });
  // TODO(A.4): implementar consumo real en la pantalla de métricas.
  return request<unknown>(`/admin/tenants/${tenantId}/metrics?${params.toString()}`, {
    method: 'GET',
    token,
  });
}

// ---------------------------------------------------------------------------
// admin/tenants/:tenantId/properties (src/admin/properties/admin-properties.controller.ts)
// TODO(A.5): tipar Property/CreatePropertyRequest reales cuando se consuma
// desde pantallas.
// ---------------------------------------------------------------------------

export type OperationType = 'SALE' | 'RENT';
export type PropertyStatus = 'ACTIVE' | 'PAUSED' | 'SOLD' | 'RENTED';

export interface ListPropertiesQuery {
  status?: PropertyStatus;
  operation?: OperationType;
  page?: number;
}

export function listProperties(
  tenantId: string,
  query: ListPropertiesQuery,
  token: string,
): Promise<unknown> {
  const params = new URLSearchParams();
  if (query.status) params.set('status', query.status);
  if (query.operation) params.set('operation', query.operation);
  if (query.page) params.set('page', String(query.page));
  const qs = params.toString();
  // TODO(A.5): implementar consumo real en la pantalla de propiedades.
  return request<unknown>(
    `/admin/tenants/${tenantId}/properties${qs ? `?${qs}` : ''}`,
    { method: 'GET', token },
  );
}

export function getProperty(
  tenantId: string,
  propertyId: string,
  token: string,
): Promise<unknown> {
  // TODO(A.5): implementar consumo real en la pantalla de propiedades.
  return request<unknown>(`/admin/tenants/${tenantId}/properties/${propertyId}`, {
    method: 'GET',
    token,
  });
}

export interface CreatePropertyRequest {
  externalRef?: string;
  title: string;
  description?: string;
  operation: OperationType;
  propertyType: string;
  price: number;
  currency?: string;
  expenses?: number;
  neighborhood: string;
  city?: string;
  address?: string;
  rooms?: number;
  bedrooms?: number;
  bathrooms?: number;
  areaM2?: number;
  garage?: boolean;
  petsAllowed?: boolean;
  features?: string[];
  listingUrl?: string;
  photoUrls?: string[];
}

export function createProperty(
  tenantId: string,
  data: CreatePropertyRequest,
  token: string,
): Promise<unknown> {
  // TODO(A.5): implementar consumo real en la pantalla de propiedades.
  return request<unknown>(`/admin/tenants/${tenantId}/properties`, {
    method: 'POST',
    body: data,
    token,
  });
}

export function updateProperty(
  tenantId: string,
  propertyId: string,
  data: Partial<CreatePropertyRequest>,
  token: string,
): Promise<unknown> {
  // TODO(A.5): implementar consumo real en la pantalla de propiedades.
  return request<unknown>(`/admin/tenants/${tenantId}/properties/${propertyId}`, {
    method: 'PATCH',
    body: data,
    token,
  });
}

export function updatePropertyStatus(
  tenantId: string,
  propertyId: string,
  status: PropertyStatus,
  token: string,
): Promise<unknown> {
  // TODO(A.5): implementar consumo real en la pantalla de propiedades.
  return request<unknown>(`/admin/tenants/${tenantId}/properties/${propertyId}/status`, {
    method: 'PATCH',
    body: { status },
    token,
  });
}

export function removeProperty(
  tenantId: string,
  propertyId: string,
  token: string,
): Promise<{ deleted: true }> {
  // TODO(A.5): implementar consumo real en la pantalla de propiedades.
  return request<{ deleted: true }>(`/admin/tenants/${tenantId}/properties/${propertyId}`, {
    method: 'DELETE',
    token,
  });
}
