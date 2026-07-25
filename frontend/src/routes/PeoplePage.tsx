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
 *   modal efímero (`ui/Modal`) con botón de copiar. No se persiste en estado
 *   global ni se loguea: vive solo en el estado local `temporaryPasswordModal`,
 *   que se descarta al cerrar el modal.
 * - Desactivar/reset de contraseña: vía `endpoints.deactivatePerson` /
 *   `endpoints.resetPassword`, seguido de un refetch de la lista.
 * - Si el backend responde 403 (AGENT que navega directo a la URL, ya que la
 *   nav de AppLayout lo oculta pero no impide navegación directa), se
 *   muestra un mensaje de permisos con `ErrorBanner` y no se renderiza la
 *   lista (no se exponen datos de otras personas del tenant) — se preserva
 *   el early-return de la versión previa, antes de llegar al `AsyncSection`.
 * - Lista vía `AsyncSection`: loading (skeleton de tabla) → empty (nuevo,
 *   testid `people-empty`) → tabla (`Table`/`THead`/`TBody` + `TableScroll`).
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
import { ErrorBanner } from '../components/ErrorBanner';
import {
  AsyncSection,
  Button,
  Card,
  CardBody,
  CardHeader,
  Input,
  Modal,
  Select,
  Skeleton,
  Table,
  TableScroll,
  TBody,
  Td,
  Th,
  THead,
  Tr,
} from '../components/ui';

function errorMessage(err: Error): string {
  return err.message || 'Ocurrió un error inesperado.';
}

function PeopleTableSkeleton(): JSX.Element {
  return (
    <TableScroll data-testid="people-skeleton">
      <Table>
        <THead>
          <Tr>
            <Th>Email</Th>
            <Th>Rol</Th>
            <Th>Activo</Th>
            <Th>Acciones</Th>
          </Tr>
        </THead>
        <TBody>
          {[0, 1, 2].map((row) => (
            <Tr key={row}>
              <Td>
                <Skeleton variant="text" />
              </Td>
              <Td>
                <Skeleton variant="text" />
              </Td>
              <Td>
                <Skeleton variant="text" />
              </Td>
              <Td>
                <Skeleton variant="text" />
              </Td>
            </Tr>
          ))}
        </TBody>
      </Table>
    </TableScroll>
  );
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
      <h1 className="mb-4 text-2xl font-semibold text-text">Gestión de personas</h1>

      <div className="mb-6">
        <AsyncSection
          loading={loading}
          skeleton={<PeopleTableSkeleton />}
          isEmpty={!loading && people.length === 0}
          emptyTestId="people-empty"
          emptyTitle="No hay personas cargadas"
          emptyMessage="Creá la primera persona del tenant con el formulario de abajo."
        >
          <TableScroll>
            <Table>
              <THead>
                <Tr>
                  <Th>Email</Th>
                  <Th>Rol</Th>
                  <Th>Activo</Th>
                  <Th>Acciones</Th>
                </Tr>
              </THead>
              <TBody>
                {people.map((p) => (
                  <Tr key={p.id}>
                    <Td>{p.email}</Td>
                    <Td>{p.role}</Td>
                    <Td>{p.active ? 'Sí' : 'No'}</Td>
                    <Td>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => handleDeactivate(p.id)}
                          disabled={!p.active}
                        >
                          Desactivar
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => handleResetPassword(p.id)}
                        >
                          Resetear contraseña
                        </Button>
                      </div>
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          </TableScroll>
        </AsyncSection>
      </div>

      {actionError && <ErrorBanner message={actionError} />}

      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold text-text">Crear persona</h2>
        </CardHeader>
        <CardBody>
          {createError && (
            <div className="mb-3">
              <ErrorBanner message={createError} />
            </div>
          )}
          <form onSubmit={handleCreate} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <label htmlFor="person-email" className="text-sm font-medium text-text">
                Email
              </label>
              <Input
                id="person-email"
                name="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={creating}
                required
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="person-role" className="text-sm font-medium text-text">
                Rol
              </label>
              <Select
                id="person-role"
                name="role"
                value={role}
                onChange={(e) => setRole(e.target.value as PersonRole)}
                disabled={creating}
              >
                <option value="AGENT">AGENT</option>
                <option value="OWNER">OWNER</option>
              </Select>
            </div>
            <div>
              <Button type="submit" disabled={creating} loading={creating}>
                Crear
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>

      <Modal
        open={Boolean(temporaryPasswordModal)}
        onClose={handleCloseModal}
        title="Contraseña temporal"
        data-testid="temporary-password-modal"
      >
        <p className="mb-2 text-sm text-text">
          Contraseña temporal (guardala ahora, no se volverá a mostrar):
        </p>
        <code className="mb-3 block rounded bg-bg px-2 py-1 text-sm">{temporaryPasswordModal}</code>
        <div className="flex items-center gap-3">
          <Button type="button" variant="secondary" size="sm" onClick={handleCopy}>
            Copiar
          </Button>
          {copied && <span className="text-sm text-success">Copiado</span>}
          <Button type="button" variant="ghost" size="sm" onClick={handleCloseModal}>
            Cerrar
          </Button>
        </div>
      </Modal>
    </div>
  );
}
