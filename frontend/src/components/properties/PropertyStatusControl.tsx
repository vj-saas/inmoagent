import React, { useState } from 'react';

import { updatePropertyStatus, type Property, type PropertyStatus } from '../../api/endpoints';
import { useApi } from '../../hooks/useApi';
import { Button, Select } from '../ui';

export interface PropertyStatusControlProps {
  property: Property;
  tenantId: string;
  token: string;
  /**
   * Callback invocado con la propiedad actualizada cuando el PATCH de estado
   * se resuelve exitosamente, para reflejar el cambio sin recargar.
   */
  onUpdated: (property: Property) => void;
}

const STATUS_LABELS: Record<PropertyStatus, string> = {
  ACTIVE: 'Activa',
  PAUSED: 'Pausada',
  RESERVED: 'Reservada',
  SOLD_OR_RENTED: 'Vendida / alquilada',
};

const STATUS_OPTIONS: PropertyStatus[] = ['ACTIVE', 'PAUSED', 'RESERVED', 'SOLD_OR_RENTED'];

/**
 * Control dedicado para cambiar el `status` de una propiedad (AC-8),
 * separado del formulario general de edición (`PropertyForm`): un solo campo,
 * un solo `PATCH :propertyId/status`.
 */
export const PropertyStatusControl: React.FC<PropertyStatusControlProps> = ({
  property,
  tenantId,
  token,
  onUpdated,
}) => {
  const [selectedStatus, setSelectedStatus] = useState<PropertyStatus>(property.status);

  const { loading, error, run } = useApi(
    updatePropertyStatus as unknown as (...args: unknown[]) => Promise<Property>,
  );

  const handleSave = async (): Promise<void> => {
    try {
      const updated = await run(tenantId, property.id, selectedStatus, token);
      onUpdated(updated);
    } catch {
      // El error ya queda expuesto vía `error` del useApi.
    }
  };

  return (
    <div data-testid="property-status-control" className="flex flex-col gap-3">
      <div>
        <label
          htmlFor="property-status-control-select"
          className="mb-1 block text-sm font-medium text-text"
        >
          Estado de la propiedad
        </label>
        <Select
          id="property-status-control-select"
          data-testid="property-status-control-select"
          value={selectedStatus}
          onChange={(e) => setSelectedStatus(e.target.value as PropertyStatus)}
          disabled={loading}
        >
          {STATUS_OPTIONS.map((status) => (
            <option key={status} value={status}>
              {STATUS_LABELS[status]}
            </option>
          ))}
        </Select>
      </div>

      <p className="text-xs text-text-muted">
        Cambiar el estado deja de ofrecer esta propiedad a leads nuevos, pero no
        retira las fichas ya enviadas en conversaciones en curso.
      </p>

      <Button
        type="button"
        data-testid="property-status-control-save"
        onClick={() => void handleSave()}
        disabled={loading || selectedStatus === property.status}
        size="sm"
        className="self-start"
      >
        {loading ? 'Guardando...' : 'Guardar estado'}
      </Button>

      {error && (
        <div data-testid="property-status-control-error" className="text-sm text-danger">
          No se pudo actualizar el estado. Verificá los datos e intentá nuevamente.
        </div>
      )}
    </div>
  );
};
