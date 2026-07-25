/**
 * Cliente HTTP centralizado sobre fetch.
 *
 * - Resuelve la base URL desde `VITE_API_BASE_URL`.
 * - Agrega `Authorization: Bearer <token>` cuando quien llama pasa un token
 *   (este módulo NO conoce sessionStorage ni ningún storage: eso es
 *   responsabilidad de `auth/session-store.ts` y `auth/AuthContext.tsx`).
 * - Mapea toda respuesta no exitosa a un tipo de error tipado.
 * - Expone `onUnauthorized(callback)` para que capas superiores (AuthContext)
 *   reaccionen a un 401 (limpiar sesión, redirigir) sin que este módulo
 *   importe React ni el router.
 */

export class NetworkError extends Error {
  constructor(message = 'No se pudo conectar con el servidor. Verificá tu conexión e intentá nuevamente.') {
    super(message);
    this.name = 'NetworkError';
  }
}

export class UnauthorizedError extends Error {
  constructor(message = 'Tu sesión no es válida o expiró.') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends Error {
  constructor(message = 'No tenés permisos para realizar esta acción.') {
    super(message);
    this.name = 'ForbiddenError';
  }
}

export class NotFoundError extends Error {
  constructor(message = 'El recurso solicitado no existe.') {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends Error {
  constructor(message = 'La operación no se pudo completar por un conflicto con el estado actual.') {
    super(message);
    this.name = 'ConflictError';
  }
}

export class ValidationError extends Error {
  /** Detalle crudo devuelto por el backend (ej. array de errores de class-validator). */
  details: unknown;

  constructor(details: unknown, message = 'Los datos enviados no son válidos.') {
    super(message);
    this.name = 'ValidationError';
    this.details = details;
  }
}

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface RequestOptions {
  method?: HttpMethod;
  body?: unknown;
  /** Token a incluir como `Authorization: Bearer <token>`. Si se omite, la request va sin autenticar. */
  token?: string;
  headers?: Record<string, string>;
}

type UnauthorizedCallback = () => void;

let unauthorizedCallback: UnauthorizedCallback | null = null;

/**
 * Registra el callback a invocar cuando una request reciba 401.
 * Llamar de nuevo reemplaza el callback anterior (solo uno activo a la vez).
 */
export function onUnauthorized(callback: UnauthorizedCallback): void {
  unauthorizedCallback = callback;
}

function getBaseUrl(): string {
  return import.meta.env.VITE_API_BASE_URL ?? '';
}

async function parseJsonSafe(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

/**
 * Nest devuelve por defecto `{ statusCode, message, error }`, con `message`
 * como string o array (class-validator). Extrae un string legible si está
 * presente, o undefined si el body no tiene ese shape.
 */
function extractMessage(body: unknown): string | undefined {
  if (body && typeof body === 'object' && 'message' in body) {
    const message = (body as { message: unknown }).message;
    if (typeof message === 'string') return message;
    if (Array.isArray(message) && message.every((m) => typeof m === 'string')) {
      return message.join(' ');
    }
  }
  return undefined;
}

export async function request<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, token, headers = {} } = options;

  const isFormData = body instanceof FormData;

  const requestHeaders: Record<string, string> = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...headers,
  };

  if (token) {
    requestHeaders.Authorization = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(`${getBaseUrl()}${path}`, {
      method,
      headers: requestHeaders,
      body: isFormData ? body : body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new NetworkError();
  }

  if (!response.ok) {
    const body = await parseJsonSafe(response);
    const message = extractMessage(body);

    if (response.status === 401) {
      unauthorizedCallback?.();
      throw new UnauthorizedError(message);
    }

    if (response.status === 403) {
      throw new ForbiddenError(message);
    }

    if (response.status === 404) {
      throw new NotFoundError(message);
    }

    if (response.status === 409) {
      throw new ConflictError(message);
    }

    if (response.status === 400) {
      throw new ValidationError(body, message);
    }

    throw new NetworkError(message ?? `Error inesperado del servidor (status ${response.status}).`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await parseJsonSafe(response)) as T;
}
