/**
 * Tabla presentacional de propiedades (AC-1).
 *
 * No hace fetch ni maneja estado propio: recibe `items` ya resueltos por el
 * orquestador (`PropertiesPage`, T16) y dispara callbacks por fila ante cada
 * acción. El cambio de estado real y el borrado real viven en componentes
 * dedicados (`PropertyStatusControl` T14, `DeletePropertyButton` T15) que el
 * padre monta a partir de `onChangeStatus`/`onDelete`; acá solo se exponen los
 * disparadores para no acoplar esta tabla a esos componentes.
 *
 * Responsive sin duplicar markup: en vez de renderizar dos veces la lista
 * (tabla + tarjetas), la fila cambia de `display: table-row` a
 * `display: block` por breakpoint vía clases de Tailwind, con un rótulo de
 * columna inline que solo se ve en mobile (`md:hidden`). Así el DOM que
 * ejercitan los tests (roles, testids) es idéntico en cualquier tamaño de
 * pantalla — nada se duplica ni se oculta con JS.
 */

import type { OperationType, Property, PropertyStatus } from '../../api/endpoints';
import { Badge, type BadgeProps, Button, Table, TableScroll, TBody, Td, Th, THead, Tr } from '../ui';

const OPERATION_LABELS: Record<OperationType, string> = {
  SALE: 'Venta',
  RENT: 'Alquiler',
  TEMP_RENT: 'Alquiler temporario',
};

const STATUS_LABELS: Record<PropertyStatus, string> = {
  ACTIVE: 'Activa',
  PAUSED: 'Pausada',
  RESERVED: 'Reservada',
  SOLD_OR_RENTED: 'Vendida/Alquilada',
};

const STATUS_TONE: Record<PropertyStatus, BadgeProps['tone']> = {
  ACTIVE: 'success',
  RESERVED: 'info',
  PAUSED: 'warning',
  SOLD_OR_RENTED: 'neutral',
};

export interface PropertiesListProps {
  items: Property[];
  onEdit: (property: Property) => void;
  onChangeStatus: (property: Property) => void;
  onDelete: (property: Property) => void;
}

const priceFormatter = new Intl.NumberFormat('es-AR');

function formatPrice(property: Property): string {
  const numeric = Number(property.price);
  const formatted = Number.isFinite(numeric) ? priceFormatter.format(numeric) : property.price;
  return `${property.currency} ${formatted}`;
}

/** Ícono de placeholder cuando la propiedad no tiene ninguna foto cargada. */
function PhotoPlaceholder(): JSX.Element {
  return (
    <div
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-card bg-bg text-text-muted"
      aria-hidden="true"
    >
      <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
        <path
          d="M4 6.5A1.5 1.5 0 0 1 5.5 5h13A1.5 1.5 0 0 1 20 6.5v11a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5v-11Z"
          stroke="currentColor"
          strokeWidth="1.5"
        />
        <path d="m4 16 4.5-4.5a1.5 1.5 0 0 1 2.12 0L14 14.9l1.4-1.4a1.5 1.5 0 0 1 2.12 0L20 16" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        <circle cx="8.5" cy="9" r="1.25" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    </div>
  );
}

/** Celda con rótulo de columna visible solo en mobile (`md:hidden`), valor siempre en un nodo propio para no romper `getByText` exacto. */
function MobileLabel({ children }: { children: string }): JSX.Element {
  return <span className="mr-2 shrink-0 text-xs font-medium text-text-muted md:hidden">{children}</span>;
}

const rowClassName =
  'flex flex-col gap-3 rounded-xl border border-border/80 bg-surface p-4.5 shadow-xs mb-3 transition-all duration-200 hover:shadow-md hover:border-text/10 ' +
  'md:table-row md:flex-none md:gap-0 md:rounded-none md:border-0 md:border-b md:border-border/60 md:bg-transparent md:p-0 md:shadow-none md:mb-0 md:hover:bg-stone-50/70';

const cellClassName = 'flex items-center justify-between gap-2 py-0.5 md:table-cell md:justify-start md:px-4 md:py-3.5';

export function PropertiesList({
  items,
  onEdit,
  onChangeStatus,
  onDelete,
}: PropertiesListProps): JSX.Element {
  return (
    <TableScroll>
      <Table className="block w-full min-w-0 md:table md:min-w-max">
        <THead className="hidden md:table-header-group">
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
        <TBody className="flex flex-col gap-3 md:table-row-group md:flex md:table-row-group md:flex-col md:gap-0 md:divide-y md:divide-border">
          {items.map((property) => {
            // Ordenado defensivo: el backend ya devuelve `photos` por `position asc`
            // (property-search.service.ts, properties-admin.service.ts), pero no
            // vale la pena que el thumbnail dependa silenciosamente de eso.
            const photoUrl = [...property.photos].sort((a, b) => a.position - b.position)[0]?.url;
            return (
              <Tr key={property.id} data-testid={`property-row-${property.id}`} className={rowClassName}>
                <Td className={cellClassName}>
                  <div className="flex min-w-0 items-center gap-3">
                    {photoUrl ? (
                      <img
                        src={photoUrl}
                        alt=""
                        className="h-10 w-10 shrink-0 rounded-card object-cover"
                      />
                    ) : (
                      <PhotoPlaceholder />
                    )}
                    <span className="min-w-0 truncate font-medium text-text">{property.title}</span>
                  </div>
                </Td>
                <Td className={cellClassName}>
                  <MobileLabel>Operación</MobileLabel>
                  <span>{OPERATION_LABELS[property.operation] ?? property.operation}</span>
                </Td>
                <Td className={cellClassName}>
                  <MobileLabel>Precio</MobileLabel>
                  <span className="font-medium text-text">{formatPrice(property)}</span>
                </Td>
                <Td className={cellClassName}>
                  <MobileLabel>Barrio</MobileLabel>
                  <span>{property.neighborhood}</span>
                </Td>
                <Td className={cellClassName}>
                  <MobileLabel>Estado</MobileLabel>
                  <Badge tone={STATUS_TONE[property.status]}>
                    {STATUS_LABELS[property.status] ?? property.status}
                  </Badge>
                </Td>
                <Td className={cellClassName}>
                  <MobileLabel>Ambientes</MobileLabel>
                  <span>{property.rooms ?? '—'}</span>
                </Td>
                <Td className="flex flex-col gap-2 pt-1 md:table-cell md:px-4 md:py-3.5">
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => onEdit(property)}
                    >
                      Editar
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => onChangeStatus(property)}
                    >
                      Cambiar estado
                    </Button>
                    <Button
                      type="button"
                      variant="danger"
                      size="sm"
                      onClick={() => onDelete(property)}
                    >
                      Borrar
                    </Button>
                  </div>
                </Td>
              </Tr>
            );
          })}
        </TBody>
      </Table>
    </TableScroll>
  );
}
