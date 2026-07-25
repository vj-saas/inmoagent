import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { updateTenantConfig } from '../../api/endpoints';
import { TenantConfigForm } from './TenantConfigForm';

vi.mock('../../api/endpoints', () => ({
  updateTenantConfig: vi.fn(),
}));

const mockUpdateTenantConfig = updateTenantConfig as unknown as ReturnType<typeof vi.fn>;

describe('TenantConfigForm', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('envía solo los campos tocados (PATCH parcial), no los 11 del form', async () => {
    mockUpdateTenantConfig.mockResolvedValue({
      id: 'tenant-1',
      name: 'Inmobiliaria Test',
      slug: 'test',
      active: true,
      phoneNumberId: 'phone-1',
      wabaId: null,
      displayPhone: null,
      botName: 'Nuevo Bot',
      botTone: '',
      schedulingLink: null,
      humanHours: null,
      competitorsToAvoid: [],
      coverageAreas: [],
      privacyNoticeSent: false,
      welcomeIntro: null,
      handoffIntro: null,
      alertPhone: '11-2222-3333',
      alertsEnabled: false,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    render(<TenantConfigForm tenantId="tenant-1" token="tok" />);

    fireEvent.change(screen.getByLabelText('Nombre del bot'), {
      target: { value: 'Nuevo Bot' },
    });
    fireEvent.change(screen.getByLabelText('Teléfono de alertas'), {
      target: { value: '11-2222-3333' },
    });

    fireEvent.click(screen.getByRole('button', { name: /guardar configuración/i }));

    await waitFor(() => {
      expect(mockUpdateTenantConfig).toHaveBeenCalledTimes(1);
    });

    const [tenantIdArg, dto, tokenArg] = mockUpdateTenantConfig.mock.calls[0];
    expect(tenantIdArg).toBe('tenant-1');
    expect(tokenArg).toBe('tok');
    expect(dto).toEqual({
      botName: 'Nuevo Bot',
      alertPhone: '11-2222-3333',
    });
  });

  it('si un campo tocado queda vacío, se envía como string vacío (borra el campo)', async () => {
    mockUpdateTenantConfig.mockResolvedValue({
      id: 'tenant-1',
      name: 'Inmobiliaria Test',
      slug: 'test',
      active: true,
      phoneNumberId: 'phone-1',
      wabaId: null,
      displayPhone: null,
      botName: '',
      botTone: '',
      schedulingLink: null,
      humanHours: null,
      competitorsToAvoid: [],
      coverageAreas: [],
      privacyNoticeSent: false,
      welcomeIntro: null,
      handoffIntro: null,
      alertPhone: null,
      alertsEnabled: false,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    render(
      <TenantConfigForm
        tenantId="tenant-1"
        token="tok"
        initialConfig={{ botName: 'Bot Original', name: 'Inmobiliaria Test' }}
      />,
    );

    const botNameInput = screen.getByLabelText('Nombre del bot');
    fireEvent.change(botNameInput, { target: { value: 'algo' } });
    fireEvent.change(botNameInput, { target: { value: '' } });

    fireEvent.click(screen.getByRole('button', { name: /guardar configuración/i }));

    await waitFor(() => {
      expect(mockUpdateTenantConfig).toHaveBeenCalledTimes(1);
    });

    const [, dto] = mockUpdateTenantConfig.mock.calls[0];
    expect(dto).toEqual({ botName: '' });
  });

  it('no envía nada si no se tocó ningún campo', async () => {
    mockUpdateTenantConfig.mockResolvedValue({});

    render(<TenantConfigForm tenantId="tenant-1" token="tok" />);

    fireEvent.click(screen.getByRole('button', { name: /guardar configuración/i }));

    await waitFor(() => {
      expect(mockUpdateTenantConfig).toHaveBeenCalledTimes(1);
    });

    const [, dto] = mockUpdateTenantConfig.mock.calls[0];
    expect(dto).toEqual({});
  });

  it('muestra el contador de caracteres de welcomeIntro y handoffIntro', () => {
    render(<TenantConfigForm tenantId="tenant-1" token="tok" />);

    fireEvent.change(screen.getByLabelText('Mensaje de bienvenida (intro)'), {
      target: { value: 'Hola' },
    });
    fireEvent.change(screen.getByLabelText('Mensaje de derivación a humano (intro)'), {
      target: { value: 'Ya te derivo' },
    });

    expect(screen.getByText('4/500 — si lo dejás vacío se usa un saludo por defecto.')).toBeInTheDocument();
    expect(
      screen.getByText('12/300 — si lo dejás vacío se usa una frase por defecto.'),
    ).toBeInTheDocument();
  });

  it('actualiza la vista previa en vivo sin llamar al backend', () => {
    render(
      <TenantConfigForm
        tenantId="tenant-1"
        token="tok"
        initialConfig={{ name: 'Inmobiliaria Test' }}
      />,
    );

    fireEvent.change(screen.getByLabelText('Mensaje de bienvenida (intro)'), {
      target: { value: 'Buenas, somos Test Homes' },
    });
    fireEvent.change(screen.getByLabelText('Horario de atención humana'), {
      target: { value: 'Lun a vie 9 a 18' },
    });
    fireEvent.change(screen.getByLabelText('Mensaje de derivación a humano (intro)'), {
      target: { value: 'Ya te paso con alguien' },
    });

    expect(screen.getByTestId('greeting-preview')).toHaveTextContent('Buenas, somos Test Homes');
    expect(screen.getByTestId('greeting-preview')).toHaveTextContent('Ley 25.326');
    expect(screen.getByTestId('handoff-preview')).toHaveTextContent('Ya te paso con alguien');
    expect(screen.getByTestId('handoff-preview')).toHaveTextContent('Lun a vie 9 a 18');
    expect(mockUpdateTenantConfig).not.toHaveBeenCalled();
  });
});
