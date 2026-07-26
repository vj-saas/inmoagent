/**
 * Tabla presentacional de propiedades (AC-1).
 *
 * No hace fetch ni maneja estado propio: recibe `items` ya resueltos por el
 * orquestador (`PropertiesPage`, T16) y dispara callbacks por fila ante cada
 * acción. El cambio de estado real y el borrado real viven en componentes
 * dedicados (`PropertyStatusControl` T14, `DeletePropertyButton` T15) que el
 * padre monta a partir de `onChangeStatus`/`onDelete`; acá solo se exponen los
 * disparadores para no acoplar esta tabla a esos componentes.
 */

import type { OperationType, Property, PropertyStatus } from '../../api/endpoints';
import { Button, Table, TableScroll, TBody, Td, Th, THead, Tr } from '../ui';

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

export interface PropertiesListProps {
  items: Property[];
  onEdit: (property: Property) => void;
  onChangeStatus: (property: Property) => void;
  onDelete: (property: Property) => void;
}

function formatPrice(property: Property): string {
  return `${property.currency} ${property.price}`;
}

export function PropertiesList({
  items,
  onEdit,
  onChangeStatus,
  onDelete,
}: PropertiesListProps): JSX.Element {
  return (
    <TableScroll>
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
          {items.map((property) => (
            <Tr key={property.id} data-testid={`property-row-${property.id}`}>
              <Td>{property.title}</Td>
              <Td>{OPERATION_LABELS[property.operation] ?? property.operation}</Td>
              <Td>{formatPrice(property)}</Td>
              <Td>{property.neighborhood}</Td>
              <Td>{STATUS_LABELS[property.status] ?? property.status}</Td>
              <Td>{property.rooms ?? '—'}</Td>
              <Td>
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
          ))}
        </TBody>
      </Table>
    </TableScroll>
  );
}
