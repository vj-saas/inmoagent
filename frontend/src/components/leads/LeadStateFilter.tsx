import React from 'react';

import type { ConversationState } from '../../api/endpoints';

/**
 * Categorías de UI para el filtro de estado de leads. Mapeo aprobado en
 * specs/A3-bandeja-leads/plan.md — no cambiar sin re-aprobar la spec.
 */
export type UiCategory =
  | 'Nuevo / calificando'
  | 'En búsqueda'
  | 'Agendó visita'
  | 'Atención humana'
  | 'Dado de baja'
  | 'Todas';

/**
 * Tabla aprobada de mapeo de categoría de UI a los `ConversationState` reales
 * del backend (calcado de `enum ConversationState` en prisma/schema.prisma).
 * "Todas" no tiene entrada acá: no envía filtro (ver `onChange` más abajo).
 */
export const UI_STATE_GROUPS: Record<Exclude<UiCategory, 'Todas'>, ConversationState[]> = {
  'Nuevo / calificando': ['GREETING', 'QUALIFICATION'],
  'En búsqueda': ['SEARCH_MATCH'],
  'Agendó visita': ['SCHEDULING'],
  'Atención humana': ['HUMAN_HANDOFF'],
  'Dado de baja': ['OPTED_OUT'],
};

const CATEGORIES: UiCategory[] = [
  'Todas',
  'Nuevo / calificando',
  'En búsqueda',
  'Agendó visita',
  'Atención humana',
  'Dado de baja',
];

export interface LeadStateFilterProps {
  /** Callback invocado con el array de `ConversationState` correspondiente a
   *  la categoría elegida, o `undefined` para "Todas" (sin filtro). */
  onChange: (states: ConversationState[] | undefined) => void;
  /** Categoría inicialmente seleccionada (por defecto "Todas"). */
  value?: UiCategory;
}

export const LeadStateFilter: React.FC<LeadStateFilterProps> = ({ onChange, value }) => {
  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const category = e.target.value as UiCategory;
    if (category === 'Todas') {
      onChange(undefined);
      return;
    }
    onChange(UI_STATE_GROUPS[category]);
  };

  return (
    <select
      data-testid="lead-state-filter"
      defaultValue={value ?? 'Todas'}
      onChange={handleChange}
      style={{
        padding: '8px 12px',
        fontSize: '14px',
        border: '1px solid #ccc',
        borderRadius: '4px',
      }}
    >
      {CATEGORIES.map((category) => (
        <option key={category} value={category}>
          {category}
        </option>
      ))}
    </select>
  );
};
