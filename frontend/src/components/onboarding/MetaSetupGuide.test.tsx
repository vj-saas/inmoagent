import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MetaSetupGuide } from './MetaSetupGuide';

describe('MetaSetupGuide Component', () => {
  afterEach(() => {
    cleanup();
  });

  it('renderiza la guía con los términos clave del setup de Meta', () => {
    render(<MetaSetupGuide />);

    expect(screen.getByTestId('meta-setup-guide')).toBeInTheDocument();
    expect(screen.getAllByText(/phoneNumberId/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/wabaId/).length).toBeGreaterThan(0);
    expect(screen.getByTestId('meta-setup-guide-webhook-url')).toBeInTheDocument();
    expect(screen.getAllByText(/META_VERIFY_TOKEN/).length).toBeGreaterThan(0);
  });

  it('arma la URL del webhook con el publicBaseUrl provisto y no muestra la nota de reemplazo', () => {
    render(<MetaSetupGuide publicBaseUrl="https://cliente.inmobilapp.com" />);

    const webhookUrl = screen.getByTestId('meta-setup-guide-webhook-url');
    expect(webhookUrl).toHaveTextContent('https://cliente.inmobilapp.com/webhook/whatsapp');
    expect(screen.queryByText(/reemplazá/i)).not.toBeInTheDocument();
  });

  it('sin publicBaseUrl muestra un placeholder de ejemplo con nota de reemplazo', () => {
    render(<MetaSetupGuide />);

    const webhookUrl = screen.getByTestId('meta-setup-guide-webhook-url');
    expect(webhookUrl).toHaveTextContent('https://tu-dominio.ejemplo.com/webhook/whatsapp');
    expect(screen.getByText(/reemplazá/i)).toBeInTheDocument();
  });
});
