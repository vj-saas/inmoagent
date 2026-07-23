/**
 * Gestión de personas del tenant (solo OWNER, ver AppLayout).
 *
 * - Lista las personas del tenant vía `endpoints.listPeople(tenantId)` usando
 *   `useApi` para loading/error (Spinner/ErrorBanner).
 * - Crear: formulario mínimo (email, rol) vía `endpoints.createPerson`. Si el
 *   backend rechaza (409 email duplicado u otro error), se muestra el motivo
 *   con `ErrorBanner` SIN agregar ninguna fila local (nada de optimistic
 *   update) — la única fuente de verdad de la lista es un refetch exitoso.
 * - Si la respuesta trae `temporaryPassword`, se muestra una única vez en un
 *   modal efímero con botón de copiar. No se persiste en estado global ni se
 *   loguea: vive solo en el estado local `temporaryPasswordModal`, que se
 *   descarta al cerrar el modal.
 * - Desactivar/reset de contraseña: vía `endpoints.deactivatePerson` /
 *   `endpoints.resetPassword`, seguido de un refetch de la lista.
 * - Si el backend responde 403 (AGENT que navega directo a la URL, ya que la
 *   nav de AppLayout lo oculta pero no impide navegación directa), se
 *   muestra un mensaje de permisos con `ErrorBanner` y no se renderiza la
 *   lista (no se exponen datos de otras personas del tenant).
 */

import { useEffect, useState } from 'react';
import {
  createPerson,
  deactivatePerson,
  listPeople,
  resetPassword,
  type PersonResponse,
  type PersonRole,
} from '../api/endpoints';
import { ForbiddenError } from '../api/http-client';
import { useAuth } from '../auth/AuthContext';
import { useApi } from '../hooks/useApi';
import { Spinner } from '../components/Spinner';
import { ErrorBanner } from '../components/ErrorBanner';

function errorMessage(err: Error): string {
  return err.message || 'Ocurrió un error inesperado.';
}

export function PeoplePage(): JSX.Element {
  const { person, token } = useAuth();
  const tenantId = person?.tenantId ?? '';

  const { loading, error, data, run: runList } = useApi<{ people: PersonResponse[] }>(
    listPeople as (...args: unknown[]) => Promise<{ people: PersonResponse[] }>,
  );

  const [email, setEmail] = useState('');
  const [role, setRole] = useState<PersonRole>('AGENT');
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [temporaryPasswordModal, setTemporaryPasswordModal] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const fetchPeople = (): void => {
    // useApi.run() ya captura el error en `error`; acá solo evitamos que la
    // promesa rechazada quede sin manejar (unhandled rejection).
    runList(tenantId, token ?? '').catch(() => {});
  };

  useEffect(() => {
    if (tenantId) {
      fetchPeople();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  const handleCreate = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (creating) {
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      const result = await createPerson(tenantId, { email, role }, token ?? '');
      setEmail('');
      setRole('AGENT');
      if ('temporaryPassword' in result) {
        setTemporaryPasswordModal(result.temporaryPassword);
      }
      fetchPeople();
    } catch (err) {
      setCreateError(err instanceof Error ? errorMessage(err) : 'No se pudo crear la persona.');
    } finally {
      setCreating(false);
    }
  };

  const handleDeactivate = async (personId: string): Promise<void> => {
    setActionError(null);
    try {
      await deactivatePerson(tenantId, personId, token ?? '');
      fetchPeople();
    } catch (err) {
      setActionError(err instanceof Error ? errorMessage(err) : 'No se pudo desactivar.');
    }
  };

  const handleResetPassword = async (personId: string): Promise<void> => {
    setActionError(null);
    try {
      const result = await resetPassword(tenantId, personId, token ?? '');
      setTemporaryPasswordModal(result.temporaryPassword);
      fetchPeople();
    } catch (err) {
      setActionError(err instanceof Error ? errorMessage(err) : 'No se pudo resetear la contraseña.');
    }
  };

  const handleCopy = async (): Promise<void> => {
    if (!temporaryPasswordModal) {
      return;
    }
    try {
      await navigator.clipboard.writeText(temporaryPasswordModal);
      setCopied(true);
    } catch {
      // Sin clipboard disponible, no hacemos nada más: el usuario puede
      // seleccionar el texto manualmente.
    }
  };

  const handleCloseModal = (): void => {
    setTemporaryPasswordModal(null);
    setCopied(false);
  };

  if (error instanceof ForbiddenError) {
    return <ErrorBanner message="No tenés permisos para acceder a la gestión de personas." />;
  }

  if (error) {
    return <ErrorBanner message={errorMessage(error)} />;
  }

  const people: PersonResponse[] = data?.people ?? [];

  return (
    <div>
      <h1>Gestión de personas</h1>

      {loading && <Spinner text="Cargando personas..." />}

      {!loading && (
        <table>
          <thead>
            <tr>
              <th>Email</th>
              <th>Rol</th>
              <th>Activo</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {people.map((p) => (
              <tr key={p.id}>
                <td>{p.email}</td>
                <td>{p.role}</td>
                <td>{p.active ? 'Sí' : 'No'}</td>
                <td>
                  <button type="button" onClick={() => handleDeactivate(p.id)} disabled={!p.active}>
                    Desactivar
                  </button>
                  <button type="button" onClick={() => handleResetPassword(p.id)}>
                    Resetear contraseña
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {actionError && <ErrorBanner message={actionError} />}

      <h2>Crear persona</h2>
      {createError && <ErrorBanner message={createError} />}
      <form onSubmit={handleCreate}>
        <div>
          <label htmlFor="person-email">Email</label>
          <input
            id="person-email"
            name="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={creating}
            required
          />
        </div>
        <div>
          <label htmlFor="person-role">Rol</label>
          <select
            id="person-role"
            name="role"
            value={role}
            onChange={(e) => setRole(e.target.value as PersonRole)}
            disabled={creating}
          >
            <option value="AGENT">AGENT</option>
            <option value="OWNER">OWNER</option>
          </select>
        </div>
        {creating && <Spinner text="Creando..." />}
        <button type="submit" disabled={creating}>
          Crear
        </button>
      </form>

      {temporaryPasswordModal && (
        <div role="dialog" aria-label="Contraseña temporal" data-testid="temporary-password-modal">
          <p>Contraseña temporal (guardala ahora, no se volverá a mostrar):</p>
          <code>{temporaryPasswordModal}</code>
          <button type="button" onClick={handleCopy}>
            Copiar
          </button>
          {copied && <span>Copiado</span>}
          <button type="button" onClick={handleCloseModal}>
            Cerrar
          </button>
        </div>
      )}
    </div>
  );
}
