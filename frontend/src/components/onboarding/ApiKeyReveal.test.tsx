import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiKeyReveal } from './ApiKeyReveal';

describe('ApiKeyReveal', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renderiza la key y arranca oculta (type password)', () => {
    render(<ApiKeyReveal apiKey="api-key-secreta" />);

    const input = screen.getByLabelText('API key');
    expect(input).toHaveAttribute('type', 'password');
    expect(input).toHaveValue('api-key-secreta');
    expect(screen.getByText(/no se vuelve a mostrar/i)).toBeInTheDocument();
  });

  it('el botón mostrar/ocultar alterna el type del input', async () => {
    render(<ApiKeyReveal apiKey="api-key-secreta" />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /mostrar api key/i }));
    expect(screen.getByLabelText('API key')).toHaveAttribute('type', 'text');

    await user.click(screen.getByRole('button', { name: /ocultar api key/i }));
    expect(screen.getByLabelText('API key')).toHaveAttribute('type', 'password');
  });

  it('el botón copiar llama a navigator.clipboard.writeText con el valor correcto y muestra confirmación', async () => {
    render(<ApiKeyReveal apiKey="api-key-secreta" />);
    // `userEvent.setup()` instala su propio stub de `navigator.clipboard`
    // (soporte de copy/paste emulado); si se mockea `writeText` ANTES de
    // `setup()`, el stub lo pisa. Por eso el spy va después.
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);

    await user.click(screen.getByRole('button', { name: /^copiar$/i }));

    expect(writeText).toHaveBeenCalledWith('api-key-secreta');
    expect(await screen.findByText('Copiado')).toBeInTheDocument();
  });
});
