/**
 * Tests del hook useApi.
 * Valida AC-13 (soporte genérico de loading/error/data).
 */

import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useApi } from './useApi';

describe('useApi', () => {
  it('retorna loading=false, error=null, data=null, run inicialmente', () => {
    // eslint-disable-next-line @typescript-eslint/require-await
    const mockFn = async () => 'resultado';
    const { result } = renderHook(() => useApi(mockFn));

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.data).toBeNull();
    expect(typeof result.current.run).toBe('function');
  });

  it('ciclo de éxito: data se establece y error permanece null', async () => {
    // eslint-disable-next-line @typescript-eslint/require-await
    const mockFn = async () => 'resultado exitoso';
    const { result } = renderHook(() => useApi(mockFn));

    let returnedData: string;
    await act(async () => {
      returnedData = await result.current.run();
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.data).toBe('resultado exitoso');
    expect(result.current.error).toBeNull();
    expect(returnedData!).toBe('resultado exitoso');
  });

  it('ciclo de error: error se establece y data permanece null', async () => {
    const testError = new Error('error de prueba');
    // eslint-disable-next-line @typescript-eslint/require-await
    const mockFn = async () => {
      throw testError;
    };
    const { result } = renderHook(() => useApi(mockFn));

    let caughtError: Error | undefined;
    await act(async () => {
      try {
        await result.current.run();
      } catch (e) {
        caughtError = e as Error;
      }
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toEqual(testError);
    expect(result.current.data).toBeNull();
    expect(caughtError).toEqual(testError);
  });

  it('run retorna el resultado si tuvo éxito', async () => {
    // eslint-disable-next-line @typescript-eslint/require-await
    const mockFn = async () => ({ id: 1, name: 'test' });
    const { result } = renderHook(() => useApi(mockFn));

    let returnValue: { id: number; name: string };
    await act(async () => {
      returnValue = await result.current.run();
    });

    expect(returnValue!).toEqual({ id: 1, name: 'test' });
  });

  it('run re-lanza el error si falló', async () => {
    const testError = new Error('test error');
    // eslint-disable-next-line @typescript-eslint/require-await
    const mockFn = async () => {
      throw testError;
    };
    const { result } = renderHook(() => useApi(mockFn));

    let caughtError: Error | undefined;
    await act(async () => {
      try {
        await result.current.run();
      } catch (e) {
        caughtError = e as Error;
      }
    });

    expect(caughtError).toEqual(testError);
  });

  it('pasa argumentos correctamente a la función de API', async () => {
    let capturedArgs: unknown[] = [];
    // eslint-disable-next-line @typescript-eslint/require-await
    const mockFn = async (...args: unknown[]) => {
      capturedArgs = args;
      return 'resultado';
    };
    const { result } = renderHook(() => useApi(mockFn));

    await act(async () => {
      await result.current.run('arg1', 42, { key: 'value' });
    });

    expect(capturedArgs).toEqual(['arg1', 42, { key: 'value' }]);
  });

  it('error no primitivo se convierte a Error', async () => {
    // eslint-disable-next-line @typescript-eslint/require-await
    const mockFn = async () => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw 'string error';
    };
    const { result } = renderHook(() => useApi(mockFn));

    await act(async () => {
      try {
        await result.current.run();
      } catch {
        // esperado
      }
    });

    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error?.message).toBe('string error');
  });

  it('limpia error al ejecutar run nuevamente después de un fallo previo', async () => {
    let shouldFail = true;
    // eslint-disable-next-line @typescript-eslint/require-await
    const mockFn = async () => {
      if (shouldFail) {
        throw new Error('fallo esperado');
      }
      return 'éxito';
    };
    const { result } = renderHook(() => useApi(mockFn));

    // Primera llamada: falla
    await act(async () => {
      try {
        await result.current.run();
      } catch {
        // esperado
      }
    });
    expect(result.current.error).toBeDefined();

    // Segunda llamada: éxito
    shouldFail = false;
    await act(async () => {
      await result.current.run();
    });

    // Error debe estar null (limpiado)
    expect(result.current.error).toBeNull();
    expect(result.current.data).toBe('éxito');
  });

  it('actualiza data al ejecutar run nuevamente', async () => {
    let counter = 0;
    // eslint-disable-next-line @typescript-eslint/require-await
    const mockFn = async () => {
      counter++;
      return `resultado ${counter}`;
    };
    const { result } = renderHook(() => useApi(mockFn));

    await act(async () => {
      await result.current.run();
    });
    expect(result.current.data).toBe('resultado 1');

    await act(async () => {
      await result.current.run();
    });
    expect(result.current.data).toBe('resultado 2');
  });
});
