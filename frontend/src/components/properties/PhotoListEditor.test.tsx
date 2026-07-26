import { beforeEach, describe, it, expect, vi } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { uploadPropertyPhoto } from '../../api/endpoints';
import { PhotoListEditor } from './PhotoListEditor';

vi.mock('../../api/endpoints', () => ({
  uploadPropertyPhoto: vi.fn(),
}));

const mockUploadPropertyPhoto = uploadPropertyPhoto as unknown as ReturnType<typeof vi.fn>;

function buildImageFile(name: string, sizeBytes: number, type = 'image/jpeg'): File {
  const content = new Uint8Array(sizeBytes);
  return new File([content], name, { type });
}

describe('PhotoListEditor Component', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('agrega una URL válida http(s) a la lista y llama a onChange con el array actualizado', async () => {
    const handleChange = vi.fn();
    const user = userEvent.setup();

    render(
      <PhotoListEditor tenantId="tenant-1" token="tok" photoUrls={[]} onChange={handleChange} />,
    );

    await user.type(
      screen.getByLabelText(/agregar por url/i),
      'https://cdn.example.com/foto1.jpg',
    );
    await user.click(screen.getByRole('button', { name: /agregar url/i }));

    expect(handleChange).toHaveBeenCalledWith(['https://cdn.example.com/foto1.jpg']);
  });

  it('rechaza una URL que no es http(s) sin agregarla', async () => {
    const handleChange = vi.fn();
    const user = userEvent.setup();

    render(
      <PhotoListEditor tenantId="tenant-1" token="tok" photoUrls={[]} onChange={handleChange} />,
    );

    await user.type(screen.getByLabelText(/agregar por url/i), 'ftp://malo.com/foto.jpg');
    await user.click(screen.getByRole('button', { name: /agregar url/i }));

    expect(handleChange).not.toHaveBeenCalled();
    expect(screen.getByTestId('error-banner')).toHaveTextContent(/url/i);
  });

  it('agrega una foto subiendo un archivo válido, llamando a uploadPropertyPhoto', async () => {
    mockUploadPropertyPhoto.mockResolvedValue({ url: 'https://cdn.example.com/subida.jpg' });
    const handleChange = vi.fn();

    render(
      <PhotoListEditor tenantId="tenant-1" token="tok" photoUrls={[]} onChange={handleChange} />,
    );

    const input = screen.getByTestId('photo-list-editor-file-input') as HTMLInputElement;
    const file = buildImageFile('foto.jpg', 1024);
    await userEvent.upload(input, file);

    await waitFor(() => {
      expect(mockUploadPropertyPhoto).toHaveBeenCalledWith('tenant-1', expect.any(File), 'tok');
    });

    await waitFor(() => {
      expect(handleChange).toHaveBeenCalledWith(['https://cdn.example.com/subida.jpg']);
    });
  });

  it('rechaza localmente un archivo mayor a 5MB sin llamar a uploadPropertyPhoto', async () => {
    const handleChange = vi.fn();

    render(
      <PhotoListEditor tenantId="tenant-1" token="tok" photoUrls={[]} onChange={handleChange} />,
    );

    const input = screen.getByTestId('photo-list-editor-file-input') as HTMLInputElement;
    const tooBig = buildImageFile('grande.jpg', 6 * 1024 * 1024);
    await userEvent.upload(input, tooBig);

    await waitFor(() => {
      expect(screen.getByTestId('error-banner')).toHaveTextContent(/5MB/i);
    });

    expect(mockUploadPropertyPhoto).not.toHaveBeenCalled();
    expect(handleChange).not.toHaveBeenCalled();
  });

  it('rechaza localmente una extensión no soportada sin llamar a uploadPropertyPhoto', async () => {
    const handleChange = vi.fn();

    render(
      <PhotoListEditor tenantId="tenant-1" token="tok" photoUrls={[]} onChange={handleChange} />,
    );

    const input = screen.getByTestId('photo-list-editor-file-input') as HTMLInputElement;
    const badExt = buildImageFile('documento.pdf', 1024, 'application/pdf');
    Object.defineProperty(input, 'files', { value: [badExt], configurable: true });
    fireEvent.change(input);

    await waitFor(() => {
      expect(screen.getByTestId('error-banner')).toHaveTextContent(/formato/i);
    });

    expect(mockUploadPropertyPhoto).not.toHaveBeenCalled();
    expect(handleChange).not.toHaveBeenCalled();
  });

  it('quita una foto de la lista', async () => {
    const handleChange = vi.fn();
    const user = userEvent.setup();

    render(
      <PhotoListEditor
        tenantId="tenant-1"
        token="tok"
        photoUrls={['https://a.com/1.jpg', 'https://a.com/2.jpg']}
        onChange={handleChange}
      />,
    );

    const removeButtons = screen.getAllByRole('button', { name: /quitar foto/i });
    await user.click(removeButtons[0]);

    expect(handleChange).toHaveBeenCalledWith(['https://a.com/2.jpg']);
  });

  it('reordena las fotos con los botones subir/bajar, reflejado en el array emitido', async () => {
    const handleChange = vi.fn();
    const user = userEvent.setup();

    render(
      <PhotoListEditor
        tenantId="tenant-1"
        token="tok"
        photoUrls={['https://a.com/1.jpg', 'https://a.com/2.jpg', 'https://a.com/3.jpg']}
        onChange={handleChange}
      />,
    );

    const downButtons = screen.getAllByRole('button', { name: /bajar foto/i });
    await user.click(downButtons[0]);

    expect(handleChange).toHaveBeenLastCalledWith([
      'https://a.com/2.jpg',
      'https://a.com/1.jpg',
      'https://a.com/3.jpg',
    ]);

    const upButtons = screen.getAllByRole('button', { name: /subir foto/i });
    await user.click(upButtons[2]);

    expect(handleChange).toHaveBeenLastCalledWith([
      'https://a.com/1.jpg',
      'https://a.com/3.jpg',
      'https://a.com/2.jpg',
    ]);
  });

  it('deshabilita el botón subir en la primera fila y bajar en la última', () => {
    render(
      <PhotoListEditor
        tenantId="tenant-1"
        token="tok"
        photoUrls={['https://a.com/1.jpg', 'https://a.com/2.jpg']}
        onChange={vi.fn()}
      />,
    );

    const upButtons = screen.getAllByRole('button', { name: /subir foto/i });
    const downButtons = screen.getAllByRole('button', { name: /bajar foto/i });

    expect(upButtons[0]).toBeDisabled();
    expect(downButtons[downButtons.length - 1]).toBeDisabled();
  });
});
