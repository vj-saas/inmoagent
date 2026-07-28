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

/**
 * Placeholder cuando la propiedad no tiene foto: un cuadrado rayado, el mismo
 * recurso que usa `EmptyState` para decir "acá no hay nada cargado".
 */
function PhotoPlaceholder(): JSX.Element {
  return <div className="u-hatch h-10 w-10 shrink-0 border border-border" aria-hidden="true" />;
}

/** Celda con rótulo de columna visible solo en mobile (`md:hidden`), valor siempre en un nodo propio para no romper `getByText` exacto. */
function MobileLabel({ children }: { children: string }): JSX.Element {
  return <span className="u-meta mr-2 shrink-0 text-text-faint md:hidden">{children}</span>;
}

// Mobile: bloque separado por hairline, sin tarjeta ni sombra.
// Desktop (`md:`): vuelve a ser una fila de tabla. Mismo DOM en ambos.
const rowClassName =
  'flex flex-col gap-2 border-b border-border py-4 transition-colors ' +
  'md:table-row md:flex-none md:gap-0 md:border-b md:border-border md:py-0 md:hover:bg-surface';

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
        <TBody className="flex flex-col md:table-row-group md:divide-y md:divide-border">
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
                      <img src={photoUrl} alt="" className="h-10 w-10 shrink-0 object-cover" />
                    ) : (
                      <PhotoPlaceholder />
                    )}
                    <span className="min-w-0 truncate font-semibold tracking-tight text-text">
                      {property.title}
                    </span>
                  </div>
                </Td>
                <Td className={cellClassName}>
                  <MobileLabel>Operación</MobileLabel>
                  <span>{OPERATION_LABELS[property.operation] ?? property.operation}</span>
                </Td>
                <Td className={cellClassName}>
                  <MobileLabel>Precio</MobileLabel>
                  {/* El precio es el dato que se compara entre filas: mono y tabular. */}
                  <span className="u-num whitespace-nowrap font-mono font-medium text-text">
                    {formatPrice(property)}
                  </span>
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
                  <span className="u-num font-mono">{property.rooms ?? '—'}</span>
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
