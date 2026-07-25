/**
 * Bandeja de leads del tenant.
 *
 * - Mantiene estado local `{ category, q, page }`. `category` es una clave de
 *   `UI_STATE_GROUPS` o "todas".
 * - Llama `listLeads(tenantId, { state, q, page }, token)` vía `useApi` cada
 *   vez que cambia `category`, `q` o `page`.
 * - Al cambiar `category` o `q` resetea `page = 1` ANTES de disparar la
 *   llamada, para nunca quedar en una página fuera de rango.
 * - Renderiza, mutuamente excluyentes vía `AsyncSection`: Spinner (loading),
 *   ErrorBanner (error), `EmptyState` (lista vacía, testid `leads-empty`), o
 *   LeadsList + Pagination.
 * - `tenantId` viene siempre de AuthContext (A.2), nunca hardcodeado.
 */

import { useEffect, useState } from 'react';
import { listLeads, type ConversationState, type Lead, type ListLeadsResponse } from '../api/endpoints';
import { useAuth } from '../auth/AuthContext';
import { useApi } from '../hooks/useApi';
import { AsyncSection } from '../components/ui';
import { LeadStateFilter } from '../components/leads/LeadStateFilter';
import { LeadSearchInput } from '../components/leads/LeadSearchInput';
import { LeadsList } from '../components/leads/LeadsList';
import { Pagination } from '../components/Pagination';

function errorMessage(err: Error): string {
  return err.message || 'Ocurrió un error inesperado.';
}

export function LeadsPage(): JSX.Element {
  const { person, token } = useAuth();
  const tenantId = person?.tenantId ?? '';

  const [states, setStates] = useState<ConversationState[] | undefined>(undefined);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);

  const { loading, error, data, run } = useApi<ListLeadsResponse>(
    listLeads as (...args: unknown[]) => Promise<ListLeadsResponse>,
  );

  const fetchLeads = (nextPage: number): void => {
    // useApi.run() ya captura el error en `error`; acá solo evitamos que la
    // promesa rechazada quede sin manejar (unhandled rejection).
    run(tenantId, { state: states, q: q || undefined, page: nextPage }, token ?? '').catch(() => {});
  };

  useEffect(() => {
    if (tenantId) {
      fetchLeads(page);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, states, q, page]);

  const handleCategoryChange = (newStates: ConversationState[] | undefined): void => {
    setStates(newStates);
    setPage(1);
  };

  const handleSearch = (newQ: string): void => {
    setQ(newQ);
    setPage(1);
  };

  const handlePageChange = (newPage: number): void => {
    setPage(newPage);
  };

  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold text-text">Bandeja de leads</h1>

      <div className="mb-4 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
        <LeadStateFilter onChange={handleCategoryChange} />
        <LeadSearchInput onSearch={handleSearch} />
      </div>

      <AsyncSection
        loading={loading}
        error={error ? errorMessage(error) : null}
        isEmpty={Boolean(data && data.leads.length === 0)}
        loadingLabel="Cargando leads..."
        emptyTestId="leads-empty"
        emptyTitle="No hay leads para este filtro"
        emptyMessage="Probá con otro filtro o cambiá los términos de búsqueda."
      >
        {data && data.leads.length > 0 && (
          <>
            <LeadsList leads={data.leads as Lead[]} />
            <Pagination
              total={data.total}
              page={data.page}
              pageSize={data.pageSize}
              onPageChange={handlePageChange}
            />
          </>
        )}
      </AsyncSection>
    </div>
  );
}
