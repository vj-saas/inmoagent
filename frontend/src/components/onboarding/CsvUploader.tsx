/**
 * Uploader de CSV de propiedades (paso de onboarding: carga inicial de stock).
 *
 * Selección de archivo con `<input type="file" accept=".csv">` (input nativo,
 * sin drag&drop real, solo estética de dropzone con las clases
 * `onboarding-uploader*`). Al confirmar, llama a `importPropertiesCsv` y
 * muestra el resultado tal cual lo devuelve el backend: cantidad de filas
 * importadas y una tabla de errores fila por fila (sin agrupar/filtrar).
 */

import { useState, type ChangeEvent, type FormEvent } from 'react';
import { importPropertiesCsv } from '../../api/endpoints';
import type { CsvImportResult } from '../../api/endpoints';
import { Button } from '../ui';
import { Table, TableScroll, THead, TBody, Tr, Th, Td } from '../ui';
import { ErrorBanner } from '../ErrorBanner';

export interface CsvUploaderProps {
  tenantId: string;
  token: string;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function errorMessage(err: Error): string {
  return err.message || 'Ocurrió un error inesperado al importar el CSV.';
}

export function CsvUploader({ tenantId, token }: CsvUploaderProps): JSX.Element {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [result, setResult] = useState<CsvImportResult | null>(null);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>): void {
    const selected = event.target.files?.[0] ?? null;
    setFile(selected);
    setResult(null);
    setError(null);
  }

  function handleRemoveFile(): void {
    setFile(null);
    setResult(null);
    setError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!file || uploading) return;

    setUploading(true);
    setError(null);
    try {
      const importResult = await importPropertiesCsv(tenantId, file, token);
      setResult(importResult);
    } catch (err) {
      const normalized = err instanceof Error ? err : new Error(String(err));
      setError(normalized);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="onboarding-uploader" data-testid="csv-uploader">
      <form onSubmit={handleSubmit}>
        <div className="onboarding-uploader-dropzone">
          <p className="onboarding-uploader-dropzone-text">Seleccioná el archivo CSV de propiedades</p>
          <p className="onboarding-uploader-dropzone-hint">Formato .csv únicamente</p>
          <input
            type="file"
            accept=".csv"
            onChange={handleFileChange}
            data-testid="csv-uploader-input"
          />
        </div>

        {file && (
          <ul className="onboarding-uploader-file-list">
            <li className="onboarding-uploader-file-item">
              <span className="onboarding-uploader-file-name">{file.name}</span>
              <span className="onboarding-uploader-file-size">{formatFileSize(file.size)}</span>
              <button
                type="button"
                className="onboarding-uploader-file-action"
                onClick={handleRemoveFile}
                aria-label="Quitar archivo"
              >
                ×
              </button>
            </li>
          </ul>
        )}

        <Button type="submit" disabled={!file} loading={uploading}>
          Importar CSV
        </Button>
      </form>

      {error && <ErrorBanner message={errorMessage(error)} />}

      {result && (
        <div data-testid="csv-uploader-result">
          <p data-testid="csv-uploader-imported-count">
            Propiedades importadas: {result.imported}
          </p>

          {result.errors.length > 0 && (
            <TableScroll>
              <Table data-testid="csv-uploader-errors-table">
                <THead>
                  <Tr>
                    <Th>Fila</Th>
                    <Th>Motivo</Th>
                  </Tr>
                </THead>
                <TBody>
                  {result.errors.map((error, index) => (
                    <Tr key={`${error.row}-${index}`}>
                      <Td>{error.row}</Td>
                      <Td>{error.message}</Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            </TableScroll>
          )}
        </div>
      )}
    </div>
  );
}
