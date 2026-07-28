/**
 * Portal de propiedades del tenant: orquestador que integra los componentes
 * de `components/properties/` construidos en T9-T15.
 *
 * - Mantiene estado local `{ filters, page }`. `filters` es un
 *   `Partial<ListPropertiesQuery>` (sin `page`) emitido por `PropertyFilters`
 *   (T10). Al cambiar cualquier filtro se resetea `page = 1` ANTES de
 *   disparar la llamada (mismo bug ya resuelto en `LeadsPage`: nunca guardar
 *   `page` fuera de rango de un filtro nuevo).
 * - Lista vía `listProperties` con `useApi`. Refetch tras CADA mutación
 *   (alta, edición, cambio de estado, borrado exitoso, import CSV) — cero
 *   optimistic update (mismo patrón que `PeoplePage`): es lo que hace que
 *   AC-10 (409 de borrado no quita la fila) funcione solo, sin lógica extra.
 * - Alta/edición: `PropertyForm` (T13) dentro de un `Modal`.
 * - Cambiar estado / borrar: al clickear "Cambiar estado"/"Borrar" en
 *   `PropertiesList` (T11) se selecciona la propiedad y se monta el
 *   componente dedicado correspondiente (`PropertyStatusControl` T14 /
 *   `DeletePropertyButton` T15) dentro de un `Modal`, con sus propios
 *   botones y su propio manejo de error (p.ej. el 409 de borrado se muestra
 *   vía el `ErrorBanner` que `DeletePropertyButton` ya expone internamente,
 *   sin duplicar nada acá). Un solo estado (`selectedAction`) controla cuál
 *   de los dos modales está abierto, así que nunca conviven los dos a la vez.
 * - Import CSV: `CsvUploader` (ya existe, del wizard de onboarding) dentro
 *   de un `Modal`, recibiendo únicamente `tenantId`/`token`. Al cerrarse el
 *   modal se dispara el refetch de la lista, sin duplicar su reporte de
 *   errores (que ya vive dentro de `CsvUploader`).
 * - Tres estados de `AsyncSection` mutuamente excluyentes: loading (skeleton
 *   de tabla), vacío (`emptyTestId="properties-empty"`) y error
 *   (`ErrorBanner`). Los dos CTAs del vacío ("Cargar propiedad" e "Importar
 *   CSV") son los mismos botones del encabezado, siempre visibles, así que
 *   conviven con el `EmptyState` sin necesitar contenido custom.
 */

import { useEffect, useState } from 'react';
import {
  listProperties,
  type ListPropertiesQuery,
  type ListPropertiesResponse,
  type Property,
} from '../api/endpoints';
import { useAuth } from '../auth/AuthContext';
import { useApi } from '../hooks/useApi';
import { PropertyFilters } from '../components/properties/PropertyFilters';
import { PropertiesList } from '../components/properties/PropertiesList';
import { PropertyForm } from '../components/properties/PropertyForm';
import { PropertyStatusControl } from '../components/properties/PropertyStatusControl';
import { DeletePropertyButton } from '../components/properties/DeletePropertyButton';
import { CsvUploader } from '../components/onboarding/CsvUploader';
import { Pagination } from '../components/Pagination';
import {
  AsyncSection,
  Button,
  Modal,
  SectionHead,
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

function PropertiesTableSkeleton(): JSX.Element {
  return (
    <TableScroll data-testid="properties-skeleton">
      <Table>
        <THead>
          <Tr>
            <Th>Título</Th>
            <Th>Operación</Th>
            <Th>Precio</Th>
            <Th>Barrio</Th>
            <Th>Estado</Th>
            <Th>Ambientes</Th>
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

interface FormModalState {
  mode: 'create' | 'edit';
  property?: Property;
}

export function PropertiesPage(): JSX.Element {
  const { person, token } = useAuth();
  const tenantId = person?.tenantId ?? '';

  const [filters, setFilters] = useState<Partial<ListPropertiesQuery>>({});
  const [page, setPage] = useState(1);

  const { loading, error, data, run } = useApi<ListPropertiesResponse>(
    listProperties as (...args: unknown[]) => Promise<ListPropertiesResponse>,
  );

  const [formModal, setFormModal] = useState<FormModalState | null>(null);
  const [selectedAction, setSelectedAction] = useState<
    { kind: 'status' | 'delete'; property: Property } | null
  >(null);
  const [csvModalOpen, setCsvModalOpen] = useState(false);

  const fetchProperties = (nextPage: number): void => {
    // useApi.run() ya captura el error en `error`; acá solo evitamos que la
    // promesa rechazada quede sin manejar (unhandled rejection).
    run(tenantId, { ...filters, page: nextPage }, token ?? '').catch(() => {});
  };

  useEffect(() => {
    if (tenantId) {
      fetchProperties(page);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, filters, page]);

  const handleFiltersChange = (patch: Partial<ListPropertiesQuery>): void => {
    setFilters((prev) => ({ ...prev, ...patch }));
    setPage(1);
  };

  const handlePageChange = (newPage: number): void => {
    setPage(newPage);
  };

  const handleOpenCreate = (): void => {
    setFormModal({ mode: 'create' });
  };

  const handleEdit = (property: Property): void => {
    setFormModal({ mode: 'edit', property });
  };

  const handleCloseFormModal = (): void => {
    setFormModal(null);
  };

  const handleSaved = (): void => {
    setFormModal(null);
    fetchProperties(page);
  };

  const handleChangeStatus = (property: Property): void => {
    setSelectedAction({ kind: 'status', property });
  };

  const handleDelete = (property: Property): void => {
    setSelectedAction({ kind: 'delete', property });
  };

  const handleCloseAction = (): void => {
    setSelectedAction(null);
  };

  const handleStatusUpdated = (): void => {
    setSelectedAction(null);
    fetchProperties(page);
  };

  const handleDeleted = (): void => {
    setSelectedAction(null);
    fetchProperties(page);
  };

  const handleOpenCsv = (): void => {
    setCsvModalOpen(true);
  };

  const handleCloseCsv = (): void => {
    setCsvModalOpen(false);
    fetchProperties(page);
  };

  const properties: Property[] = data?.items ?? [];

  return (
    <div className="space-y-8">
      <SectionHead
        index="05"
        title="Propiedades"
        kicker={data ? `${data.total} en catálogo` : 'Cargando'}
        description="El stock que el agente puede ofrecer. Solo se muestran en WhatsApp las propiedades activas."
        actions={
          <>
            <Button type="button" onClick={handleOpenCreate}>
              Cargar propiedad
            </Button>
            <Button type="button" variant="secondary" onClick={handleOpenCsv}>
              Importar CSV
            </Button>
          </>
        }
      />

      <PropertyFilters onChange={handleFiltersChange} />

      <AsyncSection
        loading={loading}
        error={error ? errorMessage(error) : null}
        isEmpty={Boolean(data && properties.length === 0)}
        skeleton={<PropertiesTableSkeleton />}
        loadingLabel="Cargando propiedades..."
        emptyTestId="properties-empty"
        emptyTitle="No hay propiedades cargadas"
        emptyMessage="Cargá la primera propiedad o importá un CSV con tu stock."
      >
        {data && properties.length > 0 && (
          // Sin card contenedora: el listado se apoya directo sobre el lienzo,
          // delimitado por las reglas de la propia tabla.
          <div>
            <PropertiesList
              items={properties}
              onEdit={handleEdit}
              onChangeStatus={handleChangeStatus}
              onDelete={handleDelete}
            />
            <Pagination
              total={data.total}
              page={data.page}
              pageSize={data.pageSize}
              onPageChange={handlePageChange}
            />
          </div>
        )}
      </AsyncSection>

      <Modal
        open={selectedAction?.kind === 'status'}
        onClose={handleCloseAction}
        title={selectedAction ? `Cambiar estado — ${selectedAction.property.title}` : undefined}
        data-testid="property-status-modal"
      >
        {selectedAction?.kind === 'status' && (
          <PropertyStatusControl
            property={selectedAction.property}
            tenantId={tenantId}
            token={token ?? ''}
            onUpdated={handleStatusUpdated}
          />
        )}
      </Modal>

      <Modal
        open={selectedAction?.kind === 'delete'}
        onClose={handleCloseAction}
        title={selectedAction ? `Eliminar propiedad — ${selectedAction.property.title}` : undefined}
        data-testid="property-delete-modal"
      >
        {selectedAction?.kind === 'delete' && (
          <DeletePropertyButton
            property={selectedAction.property}
            tenantId={tenantId}
            token={token ?? ''}
            onDeleted={handleDeleted}
          />
        )}
      </Modal>

      <Modal
        open={Boolean(formModal)}
        onClose={handleCloseFormModal}
        title={formModal?.mode === 'edit' ? 'Editar propiedad' : 'Cargar propiedad'}
        data-testid="property-form-modal"
        className="max-w-lg"
      >
        {formModal && (
          <PropertyForm
            tenantId={tenantId}
            token={token ?? ''}
            property={formModal.property}
            onSaved={handleSaved}
            onCancel={handleCloseFormModal}
          />
        )}
      </Modal>

      <Modal
        open={csvModalOpen}
        onClose={handleCloseCsv}
        title="Importar CSV de propiedades"
        data-testid="csv-import-modal"
      >
        <CsvUploader tenantId={tenantId} token={token ?? ''} />
      </Modal>
    </div>
  );
}
