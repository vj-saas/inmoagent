/**
 * Página de detalle de un lead.
 *
 * - Lee el `leadId` de los parámetros de ruta con `useParams()`.
 * - Renderiza un aviso placeholder en español indicando que la funcionalidad
 *   estará disponible en la próxima fase (AC-13).
 * - No realiza llamadas a API en esta fase (A.4 lo hará en `getOne()`).
 */

import { useParams } from 'react-router-dom';

export function LeadDetailPage(): JSX.Element {
  const { leadId } = useParams<{ leadId: string }>();

  return (
    <div>
      <h1>Ficha del lead</h1>
      <p>Lead ID: {leadId}</p>
      <div style={{ marginTop: '1rem', padding: '1rem', backgroundColor: '#f0f0f0' }}>
        <p>Ficha del lead en construcción, disponible en la próxima fase.</p>
      </div>
    </div>
  );
}
