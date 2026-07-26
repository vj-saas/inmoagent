import {
  UPLOADS_NOT_PERSISTENT_MESSAGE,
  checkUploadsMountPersistence,
  type StatDeviceFn,
  type UploadsMountLogger,
} from './uploads-mount-check.util';

describe('checkUploadsMountPersistence', () => {
  const uploadsDir = '/data/uploads';

  function makeLogger(): jest.Mocked<UploadsMountLogger> {
    return { error: jest.fn(), warn: jest.fn() };
  }

  function statWithDevices(devices: Record<string, number>): StatDeviceFn {
    return (path: string) => ({ dev: devices[path] });
  }

  it('loguea error (sin lanzar) si UPLOADS_DIR está en el mismo device que /', () => {
    const logger = makeLogger();

    expect(() =>
      checkUploadsMountPersistence({
        uploadsDir,
        nodeEnv: 'production',
        logger,
        stat: statWithDevices({ [uploadsDir]: 2049, '/': 2049 }),
      }),
    ).not.toThrow();

    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(UPLOADS_NOT_PERSISTENT_MESSAGE);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('no loguea nada si UPLOADS_DIR está en otro device (volumen montado)', () => {
    const logger = makeLogger();

    checkUploadsMountPersistence({
      uploadsDir,
      nodeEnv: 'production',
      logger,
      stat: statWithDevices({ [uploadsDir]: 66306, '/': 2049 }),
    });

    expect(logger.error).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('no chequea nada fuera de producción, aunque el device coincida', () => {
    for (const nodeEnv of ['development', 'test']) {
      const logger = makeLogger();
      const stat = jest.fn(statWithDevices({ [uploadsDir]: 2049, '/': 2049 }));

      checkUploadsMountPersistence({ uploadsDir, nodeEnv, logger, stat });

      expect(stat).not.toHaveBeenCalled();
      expect(logger.error).not.toHaveBeenCalled();
      expect(logger.warn).not.toHaveBeenCalled();
    }
  });

  it('avisa con warn y no lanza si no puede statear el directorio', () => {
    const logger = makeLogger();

    expect(() =>
      checkUploadsMountPersistence({
        uploadsDir,
        nodeEnv: 'production',
        logger,
        stat: () => {
          throw new Error('EACCES: permission denied');
        },
      }),
    ).not.toThrow();

    expect(logger.error).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('EACCES: permission denied'),
    );
  });
});
