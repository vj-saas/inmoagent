import { statSync } from 'node:fs';

/**
 * Chequeo de arranque: avisa si `UPLOADS_DIR` NO parece vivir en un volumen
 * persistente. En Railway (y en cualquier deploy con filesystem efímero), si el
 * directorio de subidas cae en el mismo device que `/` significa que está en la
 * capa de escritura del contenedor y no en un volumen montado: las fotos
 * sobreviven hasta el próximo deploy y después desaparecen.
 *
 * Es una heurística de operación, no un invariante: por eso loguea y NUNCA
 * lanza. Abortar el boot por esto tumbaría el webhook (regla de <1s) por un
 * problema que no afecta la recepción de mensajes.
 */

/** Mensaje exacto que se loguea cuando el directorio no parece persistente. */
export const UPLOADS_NOT_PERSISTENT_MESSAGE =
  'UPLOADS_DIR no parece estar en un volumen persistente: las fotos subidas se van a perder en el próximo deploy';

/** Subconjunto de `LoggerService` que necesita el chequeo. */
export interface UploadsMountLogger {
  error(message: string): void;
  warn(message: string): void;
}

/** Subconjunto de `fs.statSync` que necesita el chequeo (inyectable en tests). */
export type StatDeviceFn = (path: string) => { dev: number };

const ROOT_PATH = '/';

export interface CheckUploadsMountParams {
  uploadsDir: string;
  nodeEnv: string;
  logger: UploadsMountLogger;
  stat?: StatDeviceFn;
}

/**
 * Compara el device de `uploadsDir` contra el de `/`. Si coinciden, loguea
 * `error`. Solo corre con `NODE_ENV === 'production'`: en desarrollo y en test
 * el directorio SIEMPRE está en el mismo device que `/` (y en Windows `dev` no
 * tiene la misma semántica), así que el chequeo sería solo ruido.
 */
export function checkUploadsMountPersistence({
  uploadsDir,
  nodeEnv,
  logger,
  stat = statSync,
}: CheckUploadsMountParams): void {
  if (nodeEnv !== 'production') {
    return;
  }

  let uploadsDevice: number;
  let rootDevice: number;
  try {
    uploadsDevice = stat(uploadsDir).dev;
    rootDevice = stat(ROOT_PATH).dev;
  } catch (error: unknown) {
    // No poder verificar no es lo mismo que estar mal montado: se avisa, pero
    // con menos severidad y sin interrumpir el arranque.
    const reason = error instanceof Error ? error.message : String(error);
    logger.warn(
      `No se pudo verificar si UPLOADS_DIR está en un volumen persistente: ${reason}`,
    );
    return;
  }

  if (uploadsDevice === rootDevice) {
    logger.error(UPLOADS_NOT_PERSISTENT_MESSAGE);
  }
}
