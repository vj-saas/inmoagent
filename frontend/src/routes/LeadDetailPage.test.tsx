import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, it, expect } from 'vitest';
import { LeadDetailPage } from './LeadDetailPage';

describe('LeadDetailPage', () => {
  it('AC-13: renderiza el leadId de la URL y el aviso placeholder en español', () => {
    const testLeadId = 'lead-123';

    render(
      <MemoryRouter initialEntries={[`/leads/${testLeadId}`]}>
        <Routes>
          <Route path="/leads/:leadId" element={<LeadDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    // Verifica que el leadId aparece en la página.
    expect(screen.getByText(`Lead ID: ${testLeadId}`)).toBeInTheDocument();

    // Verifica que el aviso placeholder está presente.
    expect(
      screen.getByText('Ficha del lead en construcción, disponible en la próxima fase.'),
    ).toBeInTheDocument();

    // Verifica que el título está presente.
    expect(screen.getByRole('heading', { name: /ficha del lead/i })).toBeInTheDocument();
  });

  it('AC-13: maneja correctamente diferentes leadIds', () => {
    const testLeadId = 'another-lead-456';

    render(
      <MemoryRouter initialEntries={[`/leads/${testLeadId}`]}>
        <Routes>
          <Route path="/leads/:leadId" element={<LeadDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText(`Lead ID: ${testLeadId}`)).toBeInTheDocument();
  });
});
