/**
 * Editor de fotos de una propiedad: lista editable de `photoUrls: string[]`.
 *
 * Dos formas de agregar una URL a la lista:
 * - Elegir archivo: valida tamaño (<=5MB) y extensión (.jpg/.jpeg/.png/.webp)
 *   LOCALMENTE, antes de disparar cualquier request. Si la validación local
 *   falla, se muestra un error y `uploadPropertyPhoto` NUNCA se llama. Si pasa,
 *   sube el archivo con `uploadPropertyPhoto` (T9) y agrega la URL devuelta.
 * - Pegar URL: valida que sea http(s) en el cliente antes de agregarla.
 *
 * Reordenamiento por botones "subir"/"bajar" (sin drag-and-drop, decisión
 * explícita de la spec). Una vez que una URL entra a la lista no se distingue
 * si vino de un archivo subido o de una URL pegada: es una lista plana de
 * strings.
 *
 * La validación local es solo UX (feedback inmediato); la autoridad real
 * sigue siendo el backend (`property-photo-storage.service.ts`, T5), que
 * revalida tamaño y magic bytes reales del archivo.
 */

import { useState, type ChangeEvent, type KeyboardEvent } from 'react';
import { uploadPropertyPhoto } from '../../api/endpoints';
import { Button, Input } from '../ui';
import { ErrorBanner } from '../ErrorBanner';

export interface PhotoListEditorProps {
  tenantId: string;
  token: string;
  photoUrls: string[];
  onChange: (photoUrls: string[]) => void;
}

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];

function hasAllowedExtension(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function errorMessage(err: Error): string {
  return err.message || 'Ocurrió un error inesperado al subir la foto.';
}

export function PhotoListEditor({
  tenantId,
  token,
  photoUrls,
  onChange,
}: PhotoListEditorProps): JSX.Element {
  const [urlInput, setUrlInput] = useState('');
  const [urlError, setUrlError] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  function handleAddUrl(): void {
    const trimmed = urlInput.trim();

    if (!isHttpUrl(trimmed)) {
      setUrlError('Ingresá una URL http o https válida.');
      return;
    }

    onChange([...photoUrls, trimmed]);
    setUrlInput('');
    setUrlError(null);
  }

  function handleUrlInputKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      handleAddUrl();
    }
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0] ?? null;
    event.target.value = '';
    if (!file) return;

    setFileError(null);

    if (file.size > MAX_PHOTO_BYTES) {
      setFileError('El archivo supera el tamaño máximo permitido (5MB).');
      return;
    }

    if (!hasAllowedExtension(file.name)) {
      setFileError('Formato no soportado (se aceptan JPEG, PNG o WebP).');
      return;
    }

    setUploading(true);
    try {
      const { url } = await uploadPropertyPhoto(tenantId, file, token);
      onChange([...photoUrls, url]);
    } catch (err) {
      const normalized = err instanceof Error ? err : new Error(String(err));
      setFileError(errorMessage(normalized));
    } finally {
      setUploading(false);
    }
  }

  function handleRemove(index: number): void {
    const next = photoUrls.filter((_, i) => i !== index);
    onChange(next);
  }

  function handleMoveUp(index: number): void {
    if (index === 0) return;
    const next = [...photoUrls];
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
    onChange(next);
  }

  function handleMoveDown(index: number): void {
    if (index === photoUrls.length - 1) return;
    const next = [...photoUrls];
    [next[index], next[index + 1]] = [next[index + 1], next[index]];
    onChange(next);
  }

  return (
    <div data-testid="photo-list-editor" className="flex flex-col gap-3">
      {photoUrls.length > 0 && (
        <ul data-testid="photo-list" className="flex flex-col gap-2">
          {photoUrls.map((url, index) => (
            <li
              key={`${url}-${index}`}
              data-testid="photo-list-item"
              className="flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2"
            >
              <span
                data-testid="photo-list-item-url"
                className="min-w-0 flex-1 truncate text-sm text-text-muted"
                title={url}
              >
                {url}
              </span>
              <div className="flex shrink-0 gap-1">
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  onClick={() => handleMoveUp(index)}
                  disabled={index === 0}
                  aria-label="Subir foto"
                >
                  ↑
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  onClick={() => handleMoveDown(index)}
                  disabled={index === photoUrls.length - 1}
                  aria-label="Bajar foto"
                >
                  ↓
                </Button>
                <Button
                  type="button"
                  variant="danger"
                  size="sm"
                  onClick={() => handleRemove(index)}
                  aria-label="Quitar foto"
                >
                  Quitar
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div>
        <label
          htmlFor="photo-list-editor-url-input"
          className="mb-1 block text-sm font-medium text-text"
        >
          Agregar por URL
        </label>
        <div className="flex gap-2">
          <Input
            id="photo-list-editor-url-input"
            type="text"
            value={urlInput}
            onChange={(event) => {
              setUrlInput(event.target.value);
              setUrlError(null);
            }}
            onKeyDown={handleUrlInputKeyDown}
            placeholder="https://..."
            invalid={Boolean(urlError)}
          />
          <Button type="button" variant="secondary" onClick={handleAddUrl}>
            Agregar URL
          </Button>
        </div>
        {urlError && <ErrorBanner message={urlError} />}
      </div>

      <div>
        <label
          htmlFor="photo-list-editor-file-input"
          className="mb-1 block text-sm font-medium text-text"
        >
          Subir archivo
        </label>
        <input
          id="photo-list-editor-file-input"
          type="file"
          accept=".jpg,.jpeg,.png,.webp"
          onChange={handleFileChange}
          disabled={uploading}
          data-testid="photo-list-editor-file-input"
          className="block w-full text-sm text-text-muted file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-2 file:text-sm file:font-medium file:text-white file:hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
        />
        {uploading && (
          <span data-testid="photo-list-editor-uploading" className="mt-1 block text-sm text-text-muted">
            Subiendo...
          </span>
        )}
        {fileError && <ErrorBanner message={fileError} />}
      </div>
    </div>
  );
}
