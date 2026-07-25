import { beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { LeadModeBadge, resolveLeadMode } from './LeadModeBadge';

describe('resolveLeadMode', () => {
  it('devuelve MANUAL para HUMAN_HANDOFF', () => {
    expect(resolveLeadMode('HUMAN_HANDOFF')).toBe('MANUAL');
  });

  it('devuelve OPTED_OUT para OPTED_OUT', () => {
    expect(resolveLeadMode('OPTED_OUT')).toBe('OPTED_OUT');
  });

  it.each(['GREETING', 'QUALIFICATION', 'SEARCH_MATCH', 'SCHEDULING'])(
    'devuelve AI para el estado conocido %s',
    (state) => {
      expect(resolveLeadMode(state)).toBe('AI');
    },
  );

  it('devuelve AI por default ante un estado desconocido de la FSM', () => {
    expect(resolveLeadMode('ESTADO_QUE_NO_EXISTE_TODAVIA')).toBe('AI');
  });
});

describe('LeadModeBadge Component', () => {
  beforeEach(() => {
    cleanup();
  });

  it('muestra "Respondiendo vos" para HUMAN_HANDOFF', () => {
    render(<LeadModeBadge state="HUMAN_HANDOFF" />);
    expect(screen.getByText('Respondiendo vos')).toBeInTheDocument();
  });

  it('muestra "Dado de baja" para OPTED_OUT', () => {
    render(<LeadModeBadge state="OPTED_OUT" />);
    expect(screen.getByText('Dado de baja')).toBeInTheDocument();
  });

  it('muestra "Agente IA activo" para un estado conocido de IA', () => {
    render(<LeadModeBadge state="QUALIFICATION" />);
    expect(screen.getByText('Agente IA activo')).toBeInTheDocument();
  });

  it('muestra "Agente IA activo" por default ante un estado desconocido', () => {
    render(<LeadModeBadge state="ESTADO_QUE_NO_EXISTE_TODAVIA" />);
    expect(screen.getByText('Agente IA activo')).toBeInTheDocument();
  });
});
