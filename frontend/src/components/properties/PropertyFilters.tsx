import React, { useEffect, useRef, useState } from 'react';

import type { ListPropertiesQuery, OperationType, PropertyStatus } from '../../api/endpoints';
import { Card, CardBody, Input, Select } from '../ui';

const DEBOUNCE_MS = 300;

const STATUS_OPTIONS: { value: PropertyStatus; label: string }[] = [
  { value: 'ACTIVE', label: 'Activa' },
  { value: 'RESERVED', label: 'Reservada' },
  { value: 'SOLD_OR_RENTED', label: 'Vendida/Alquilada' },
  { value: 'PAUSED', label: 'Pausada' },
];

const OPERATION_OPTIONS: { value: OperationType; label: string }[] = [
  { value: 'SALE', label: 'Venta' },
  { value: 'RENT', label: 'Alquiler' },
  { value: 'TEMP_RENT', label: 'Alquiler temporario' },
];

// Opciones fijas de ambientes exactos (no rango libre): coincide con la nota
// de negocio de que `rooms` filtra por igualdad exacta, no "mínimo N".
const ROOMS_OPTIONS = [1, 2, 3, 4, 5];

export interface PropertyFiltersProps {
  /**
   * Invocado con un parche parcial de `ListPropertiesQuery` cada vez que un
   * filtro cambia. Los selects (`status`, `operation`, `rooms`) disparan al
   * cambiar; los campos de texto/número (`q`, `minPrice`, `maxPrice`,
   * `neighborhood`) se debouncean ~300ms para no disparar un request por
   * tecla tipeada.
   */
  onChange: (patch: Partial<ListPropertiesQuery>) => void;
}

/**
 * Usa un `setTimeout` reiniciado en cada cambio (mismo patrón que
 * `LeadSearchInput`) para debouncear la emisión de un valor de filtro.
 */
function useDebouncedEmit<T>(value: T, emit: (value: T) => void, delay: number): void {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const emitRef = useRef(emit);
  emitRef.current = emit;
  const isFirstRun = useRef(true);

  useEffect(() => {
    if (isFirstRun.current) {
      // No emitir en el mount inicial: sólo ante cambios del usuario.
      isFirstRun.current = false;
      return;
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      emitRef.current(value);
    }, delay);
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, delay]);
}

export const PropertyFilters: React.FC<PropertyFiltersProps> = ({ onChange }) => {
  const [q, setQ] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');

  useDebouncedEmit(q, (value) => onChange({ q: value.trim() || undefined }), DEBOUNCE_MS);
  useDebouncedEmit(
    neighborhood,
    (value) => onChange({ neighborhood: value.trim() || undefined }),
    DEBOUNCE_MS,
  );
  useDebouncedEmit(
    minPrice,
    (value) => onChange({ minPrice: value === '' ? undefined : Number(value) }),
    DEBOUNCE_MS,
  );
  useDebouncedEmit(
    maxPrice,
    (value) => onChange({ maxPrice: value === '' ? undefined : Number(value) }),
    DEBOUNCE_MS,
  );

  const handleStatusChange = (e: React.ChangeEvent<HTMLSelectElement>): void => {
    const value = e.target.value as PropertyStatus | '';
    onChange({ status: value === '' ? undefined : value });
  };

  const handleOperationChange = (e: React.ChangeEvent<HTMLSelectElement>): void => {
    const value = e.target.value as OperationType | '';
    onChange({ operation: value === '' ? undefined : value });
  };

  const handleRoomsChange = (e: React.ChangeEvent<HTMLSelectElement>): void => {
    const value = e.target.value;
    onChange({ rooms: value === '' ? undefined : Number(value) });
  };

  return (
    <Card className="mb-4">
      <CardBody className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold text-text">Filtros</h2>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex flex-col gap-1 lg:col-span-2">
            <label htmlFor="property-filter-q" className="text-sm text-text-muted">
              Buscar
            </label>
            <Input
              id="property-filter-q"
              data-testid="property-filter-q"
              type="text"
              placeholder="Título, dirección..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="property-filter-status" className="text-sm text-text-muted">
              Estado
            </label>
            <Select
              id="property-filter-status"
              data-testid="property-filter-status"
              defaultValue=""
              onChange={handleStatusChange}
            >
              <option value="">Todos</option>
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="property-filter-operation" className="text-sm text-text-muted">
              Operación
            </label>
            <Select
              id="property-filter-operation"
              data-testid="property-filter-operation"
              defaultValue=""
              onChange={handleOperationChange}
            >
              <option value="">Todas</option>
              {OPERATION_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="property-filter-neighborhood" className="text-sm text-text-muted">
              Barrio
            </label>
            <Input
              id="property-filter-neighborhood"
              data-testid="property-filter-neighborhood"
              type="text"
              placeholder="Barrio"
              value={neighborhood}
              onChange={(e) => setNeighborhood(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="property-filter-min-price" className="text-sm text-text-muted">
              Precio mínimo
            </label>
            <Input
              id="property-filter-min-price"
              data-testid="property-filter-min-price"
              type="number"
              placeholder="Mínimo"
              value={minPrice}
              onChange={(e) => setMinPrice(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="property-filter-max-price" className="text-sm text-text-muted">
              Precio máximo
            </label>
            <Input
              id="property-filter-max-price"
              data-testid="property-filter-max-price"
              type="number"
              placeholder="Máximo"
              value={maxPrice}
              onChange={(e) => setMaxPrice(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="property-filter-rooms" className="text-sm text-text-muted">
              Ambientes
            </label>
            <Select
              id="property-filter-rooms"
              data-testid="property-filter-rooms"
              defaultValue=""
              onChange={handleRoomsChange}
            >
              <option value="">Cualquiera</option>
              {ROOMS_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="flex flex-col gap-1 border-t border-border pt-3">
          <p className="text-xs text-text-muted">
            El filtro de precio (mínimo y máximo) compara sobre el valor numérico cargado,
            sin conversión de moneda: propiedades en distintas monedas no se equiparan.
          </p>
          <p className="text-xs text-text-muted">
            El filtro de ambientes busca una coincidencia exacta y excluye las propiedades
            que no tienen la cantidad de ambientes cargada.
          </p>
        </div>
      </CardBody>
    </Card>
  );
};
