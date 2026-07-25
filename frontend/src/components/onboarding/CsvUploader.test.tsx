import { beforeEach, describe, it, expect, vi } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { importPropertiesCsv } from '../../api/endpoints';
import { NetworkError } from '../../api/http-client';
import { CsvUploader } from './CsvUploader';

vi.mock('../../api/endpoints', () => ({
  importPropertiesCsv: vi.fn(),
}));

const mockImportPropertiesCsv = importPropertiesCsv as unknown as ReturnType<typeof vi.fn>;

function buildCsvFile(): File {
  return new File(['a,b,c'], 'propiedades.csv', { type: 'text/csv' });
}

async function selectFile(): Promise<void> {
  const input = screen.getByTestId('csv-uploader-input') as HTMLInputElement;
  await userEvent.upload(input, buildCsvFile());
}

describe('CsvUploader Component', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('sube el CSV seleccionado y renderiza la cantidad importada y la tabla de errores exacta', async () => {
    mockImportPropertiesCsv.mockResolvedValue({
      imported: 3,
      errors: [
        { row: 5, message: 'precio inválido' },
        { row: 9, message: 'barrio vacío' },
      ],
    });

    render(<CsvUploader tenantId="tenant-1" token="tok" />);

    await selectFile();
    fireEvent.click(screen.getByRole('button', { name: /importar csv/i }));

    await waitFor(() => {
      expect(mockImportPropertiesCsv).toHaveBeenCalledWith('tenant-1', expect.any(File), 'tok');
    });

    await waitFor(() => {
      expect(screen.getByTestId('csv-uploader-result')).toBeInTheDocument();
    });

    expect(screen.getByTestId('csv-uploader-imported-count')).toHaveTextContent('3');

    const table = screen.getByTestId('csv-uploader-errors-table');
    const rows = table.querySelectorAll('tbody tr');
    expect(rows).toHaveLength(2);

    expect(rows[0]).toHaveTextContent('5');
    expect(rows[0]).toHaveTextContent('precio inválido');
    expect(rows[1]).toHaveTextContent('9');
    expect(rows[1]).toHaveTextContent('barrio vacío');
  });

  it('deshabilita el botón de submit mientras la carga está en curso y evita doble submit', async () => {
    let resolvePromise: (value: { imported: number; errors: never[] }) => void = () => {};
    mockImportPropertiesCsv.mockReturnValue(
      new Promise((resolve) => {
        resolvePromise = resolve;
      }),
    );

    render(<CsvUploader tenantId="tenant-1" token="tok" />);

    await selectFile();
    const submitButton = screen.getByRole('button', { name: /importar csv/i });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(submitButton).toBeDisabled();
    });

    fireEvent.click(submitButton);
    expect(mockImportPropertiesCsv).toHaveBeenCalledTimes(1);

    resolvePromise({ imported: 1, errors: [] });

    await waitFor(() => {
      expect(submitButton).not.toBeDisabled();
    });
  });

  it('muestra un banner de error si la importación falla por un error de red', async () => {
    mockImportPropertiesCsv.mockRejectedValue(new NetworkError('No se pudo conectar con el servidor.'));

    render(<CsvUploader tenantId="tenant-1" token="tok" />);

    await selectFile();
    fireEvent.click(screen.getByRole('button', { name: /importar csv/i }));

    await waitFor(() => {
      expect(screen.getByTestId('error-banner')).toHaveTextContent(
        'No se pudo conectar con el servidor.',
      );
    });

    expect(screen.queryByTestId('csv-uploader-result')).not.toBeInTheDocument();
  });
});
