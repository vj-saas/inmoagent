/**
 * Hook genérico de React para envolver llamadas asincrónicas a la API.
 *
 * Expone de forma uniforme:
 * - loading: boolean mientras la llamada está en curso
 * - error: Error tipado si falló (NetworkError, UnauthorizedError, etc.)
 * - data: resultado tipado si tuvo éxito
 * - run: función que dispara la llamada (recibe los argumentos que necesite la función de API envuelta)
 *
 * Ejemplos de uso:
 *   const { loading, error, data, run } = useApi(api.login);
 *   const { loading, error, data, run } = useApi(api.listPeople);
 *   const { loading, error, data, run } = useApi((id) => api.deletePerson(id));
 */

import { useState } from 'react';

export type UseApiReturn<T> = {
  loading: boolean;
  error: Error | null;
  data: T | null;
  run: (...args: unknown[]) => Promise<T>;
};

/**
 * Hook que envuelve una función async y maneja el ciclo de vida de la llamada.
 * @param apiFunc función async que retorna T
 * @returns { loading, error, data, run }
 */
export function useApi<T>(
  apiFunc: (...args: unknown[]) => Promise<T>,
): UseApiReturn<T> {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [data, setData] = useState<T | null>(null);

  const run = async (...args: unknown[]): Promise<T> => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiFunc(...args);
      setData(result);
      return result;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  return { loading, error, data, run };
}
