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
// ---------------------------------------------------------------------------

// Calcado del modelo `Message` en prisma/schema.prisma.
export type MessageDirection = 'IN' | 'OUT';
export type MessageType = 'TEXT' | 'AUDIO' | 'IMAGE' | 'DOCUMENT' | 'TEMPLATE' | 'UNSUPPORTED';

export interface Message {
  id: string;
  tenantId: string;
  leadId: string;
  direction: MessageDirection;
  type: MessageType;
  waMessageId: string | null;
  body: string | null;
  mediaId: string | null;
  transcription: string | null;
  meta: unknown;
  createdAt: string;
}

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
  contactedAt: string | null;
  assignedUserId: string | null;
  nextActionAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// Calcado del modelo `LeadNote` (ver prisma/schema.prisma, spec A.4).
export interface LeadNote {
  id: string;
  tenantId: string;
  leadId: string;
  authorPersonId: string | null;
  author: { id: string; email: string } | null;
  body: string;
  createdAt: string;
}

// Persona asignable a un lead (ver src/auth/admin-people.controller.ts,
// endpoint people/assignable).
export interface AssignableUser {
  id: string;
  email: string;
  role: PersonRole;
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
): Promise<{ lead: Lead; messages: Message[] }> {
  return request<{ lead: Lead; messages: Message[] }>(
    `/admin/tenants/${tenantId}/leads/${leadId}/messages`,
    { method: 'GET', token },
  );
}

export function releaseLead(
  tenantId: string,
  leadId: string,
  token: string,
): Promise<{ released: true }> {
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
  return request<{ deleted: true }>(`/admin/tenants/${tenantId}/leads/${leadId}`, {
    method: 'DELETE',
    token,
  });
}

export function createNote(
  tenantId: string,
  leadId: string,
  body: string,
  token: string,
): Promise<LeadNote> {
  return request<LeadNote>(`/admin/tenants/${tenantId}/leads/${leadId}/notes`, {
    method: 'POST',
    body: { body },
    token,
  });
}

export function getLeadNotes(
  tenantId: string,
  leadId: string,
  token: string,
): Promise<{ notes: LeadNote[] }> {
  return request<{ notes: LeadNote[] }>(`/admin/tenants/${tenantId}/leads/${leadId}/notes`, {
    method: 'GET',
    token,
  });
}

export function markContacted(tenantId: string, leadId: string, token: string): Promise<Lead> {
  return request<Lead>(`/admin/tenants/${tenantId}/leads/${leadId}/contacted`, {
    method: 'POST',
    token,
  });
}

export function markUncontacted(tenantId: string, leadId: string, token: string): Promise<Lead> {
  return request<Lead>(`/admin/tenants/${tenantId}/leads/${leadId}/uncontacted`, {
    method: 'POST',
    token,
  });
}

export function optOutLead(tenantId: string, leadId: string, token: string): Promise<Lead> {
  return request<Lead>(`/admin/tenants/${tenantId}/leads/${leadId}/opt-out`, {
    method: 'POST',
    token,
  });
}

export interface PatchAssignmentRequest {
  assignedUserId?: string | null;
  nextActionAt?: string | null;
}

export function patchAssignment(
  tenantId: string,
  leadId: string,
  dto: PatchAssignmentRequest,
  token: string,
): Promise<Lead> {
  return request<Lead>(`/admin/tenants/${tenantId}/leads/${leadId}/assignment`, {
    method: 'PATCH',
    body: dto,
    token,
  });
}

export function listAssignableUsers(
  tenantId: string,
  token: string,
): Promise<{ users: AssignableUser[] }> {
  return request<{ users: AssignableUser[] }>(
    `/admin/tenants/${tenantId}/people/assignable`,
    { method: 'GET', token },
  );
}

// ---------------------------------------------------------------------------
// admin/tenants/:tenantId/metrics (src/admin/metrics/admin-metrics.controller.ts)
// ---------------------------------------------------------------------------

export interface MetricsQuery {
  from: string;
  to: string;
}

export interface MetricsResult {
  range: { from: string; to: string };
  newLeads: number;
  activeConversations: number;
  handoffs: number;
  appointments: { proposed: number; confirmed: number };
}

export function getMetrics(
  tenantId: string,
  query: MetricsQuery,
  token: string,
): Promise<MetricsResult> {
  const params = new URLSearchParams({ from: query.from, to: query.to });
  return request<MetricsResult>(`/admin/tenants/${tenantId}/metrics?${params.toString()}`, {
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

// ---------------------------------------------------------------------------
// admin/tenants/:tenantId/appointments (src/appointments — spec B.2)
// ---------------------------------------------------------------------------

export type AppointmentStatus = 'PROPOSED' | 'CONFIRMED' | 'DONE' | 'CANCELLED' | 'NO_SHOW';

export interface Appointment {
  id: string;
  tenantId: string;
  leadId: string;
  status: AppointmentStatus;
  scheduledAt: string | null;
  notes: string | null;
  outcome: string | null;
  assignedUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ListAppointmentsQuery {
  from?: string;
  to?: string;
  status?: AppointmentStatus[];
}

export interface ListAppointmentsResponse {
  appointments: Appointment[];
}

export function listAppointments(
  tenantId: string,
  query: ListAppointmentsQuery,
  token: string,
): Promise<ListAppointmentsResponse> {
  const params = new URLSearchParams();
  if (query.from) params.set('from', query.from);
  if (query.to) params.set('to', query.to);
  if (query.status) {
    for (const s of query.status) params.append('status', s);
  }
  const qs = params.toString();
  return request<ListAppointmentsResponse>(
    `/admin/tenants/${tenantId}/appointments${qs ? `?${qs}` : ''}`,
    { method: 'GET', token },
  );
}

export interface ConfirmAppointmentRequest {
  scheduledAt: string;
  assignedUserId?: string;
  notes?: string;
}

export function confirmAppointment(
  tenantId: string,
  appointmentId: string,
  data: ConfirmAppointmentRequest,
  token: string,
): Promise<Appointment> {
  return request<Appointment>(`/admin/tenants/${tenantId}/appointments/${appointmentId}/confirm`, {
    method: 'POST',
    body: data,
    token,
  });
}

export interface RescheduleAppointmentRequest {
  scheduledAt: string;
  notes?: string;
}

export function rescheduleAppointment(
  tenantId: string,
  appointmentId: string,
  data: RescheduleAppointmentRequest,
  token: string,
): Promise<Appointment> {
  return request<Appointment>(
    `/admin/tenants/${tenantId}/appointments/${appointmentId}/reschedule`,
    {
      method: 'POST',
      body: data,
      token,
    },
  );
}

export interface CancelAppointmentRequest {
  notes?: string;
}

export function cancelAppointment(
  tenantId: string,
  appointmentId: string,
  data: CancelAppointmentRequest,
  token: string,
): Promise<Appointment> {
  return request<Appointment>(`/admin/tenants/${tenantId}/appointments/${appointmentId}/cancel`, {
    method: 'POST',
    body: data,
    token,
  });
}

export interface MarkAppointmentDoneRequest {
  outcome?: string;
  notes?: string;
}

export function markAppointmentDone(
  tenantId: string,
  appointmentId: string,
  data: MarkAppointmentDoneRequest,
  token: string,
): Promise<Appointment> {
  return request<Appointment>(`/admin/tenants/${tenantId}/appointments/${appointmentId}/done`, {
    method: 'POST',
    body: data,
    token,
  });
}

export interface MarkAppointmentNoShowRequest {
  outcome?: string;
  notes?: string;
}

export function markAppointmentNoShow(
  tenantId: string,
  appointmentId: string,
  data: MarkAppointmentNoShowRequest,
  token: string,
): Promise<Appointment> {
  return request<Appointment>(
    `/admin/tenants/${tenantId}/appointments/${appointmentId}/no-show`,
    {
      method: 'POST',
      body: data,
      token,
    },
  );
}

// ---------------------------------------------------------------------------
// admin/tenants — wizard de onboarding (src/admin/tenants, src/auth — spec
// V-C-onboarding-tenant). `createTenant` y `bootstrapOwner` son las únicas
// funciones de este módulo que se autentican con `X-Master-Key` (no hay sesión
// de persona todavía en ese punto del wizard); el resto usa el token de
// sesión, igual que el resto de este archivo.
// ---------------------------------------------------------------------------

// Calcado de `CreateTenantDto` (src/admin/tenants/create-tenant.dto.ts).
export interface CreateTenantRequest {
  name: string;
  slug: string;
  phoneNumberId: string;
  wabaId?: string;
  accessToken: string;
  displayPhone?: string;
  botName?: string;
  botTone?: string;
  schedulingLink?: string;
  humanHours?: string;
  competitorsToAvoid?: string[];
  coverageAreas?: string[];
  alertPhone?: string;
  alertsEnabled?: boolean;
}

// Calcado de `CreatedTenant` (src/admin/tenants/tenants-admin.service.ts).
export interface CreatedTenant {
  tenantId: string;
  apiKey: string;
}

export function createTenant(
  dto: CreateTenantRequest,
  masterKey: string,
): Promise<CreatedTenant> {
  return request<CreatedTenant>('/admin/tenants', {
    method: 'POST',
    body: dto,
    headers: { 'X-Master-Key': masterKey },
  });
}

// Calcado de `BootstrapOwnerDto` (src/auth/dto/bootstrap-owner.dto.ts).
export interface BootstrapOwnerRequest {
  email: string;
  password: string;
}

export function bootstrapOwner(
  tenantId: string,
  dto: BootstrapOwnerRequest,
  masterKey: string,
): Promise<PersonResponse> {
  return request<PersonResponse>(
    `/admin/tenants/${tenantId}/people/bootstrap-owner`,
    {
      method: 'POST',
      body: dto,
      headers: { 'X-Master-Key': masterKey },
    },
  );
}

// Calcado de `CsvImportResult` (src/admin/properties/csv-import.service.ts).
export interface CsvImportError {
  row: number;
  message: string;
}

export interface CsvImportResult {
  imported: number;
  errors: CsvImportError[];
}

export function importPropertiesCsv(
  tenantId: string,
  file: File,
  token: string,
): Promise<CsvImportResult> {
  const formData = new FormData();
  formData.append('file', file);
  return request<CsvImportResult>(`/admin/tenants/${tenantId}/properties/import`, {
    method: 'POST',
    body: formData,
    token,
  });
}

// Calcado de `UpdateTenantConfigDto` (src/admin/tenants/update-tenant-config.dto.ts).
export interface UpdateTenantConfigRequest {
  alertPhone?: string;
  alertsEnabled?: boolean;
  humanHours?: string;
  botName?: string;
  botTone?: string;
  schedulingLink?: string;
  coverageAreas?: string[];
  competitorsToAvoid?: string[];
  displayPhone?: string;
  welcomeIntro?: string;
  handoffIntro?: string;
}

// Calcado de `TenantConfigResponse` (src/admin/tenants/tenant-config-response.ts).
export interface TenantConfigResponse {
  id: string;
  name: string;
  slug: string;
  active: boolean;
  phoneNumberId: string;
  wabaId: string | null;
  displayPhone: string | null;
  botName: string;
  botTone: string;
  schedulingLink: string | null;
  humanHours: string | null;
  competitorsToAvoid: string[];
  coverageAreas: string[];
  privacyNoticeSent: boolean;
  welcomeIntro: string | null;
  handoffIntro: string | null;
  alertPhone: string | null;
  alertsEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export function updateTenantConfig(
  tenantId: string,
  dto: UpdateTenantConfigRequest,
  token: string,
): Promise<TenantConfigResponse> {
  return request<TenantConfigResponse>(`/admin/tenants/${tenantId}/config`, {
    method: 'PATCH',
    body: dto,
    token,
  });
}

// Calcado del handler `webhookStatus` (src/admin/tenants/admin-tenants.controller.ts).
export interface WebhookStatusResponse {
  connected: boolean;
  lastEventAt: string | null;
  lastMessageAt: string | null;
}

export function getWebhookStatus(
  tenantId: string,
  token: string,
): Promise<WebhookStatusResponse> {
  return request<WebhookStatusResponse>(`/admin/tenants/${tenantId}/webhook-status`, {
    method: 'GET',
    token,
  });
}
