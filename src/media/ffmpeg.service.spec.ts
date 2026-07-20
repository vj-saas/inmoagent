import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { FfmpegService } from './ffmpeg.service';

const execFileAsync = promisify(execFile);

describe('FfmpegService', () => {
  const service = new FfmpegService();
  const oggPath = join(tmpdir(), `ffmpeg-test-${Date.now()}.ogg`);
  const mp3Path = join(tmpdir(), `ffmpeg-test-${Date.now()}.mp3`);

  beforeAll(async () => {
    // Genera un .ogg mínimo real (1s de tono) para probar la conversión de punta a punta.
    await execFileAsync('ffmpeg', [
      '-y',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=440:duration=1',
      '-c:a',
      'libvorbis',
      oggPath,
    ]);
  }, 15000);

  afterAll(async () => {
    await Promise.all([
      fs.rm(oggPath, { force: true }),
      fs.rm(mp3Path, { force: true }),
    ]);
  });

  it('convierte un .ogg real a .mp3 mono 16kHz', async () => {
    await service.convertToMp3(oggPath, mp3Path);

    const stat = await fs.stat(mp3Path);
    expect(stat.size).toBeGreaterThan(0);

    const { stdout } = await execFileAsync('ffprobe', [
      '-v',
      'error',
      '-select_streams',
      'a:0',
      '-show_entries',
      'stream=codec_name,sample_rate,channels',
      '-of',
      'json',
      mp3Path,
    ]);
    const probe = JSON.parse(stdout) as {
      streams: Array<{
        codec_name: string;
        sample_rate: string;
        channels: number;
      }>;
    };

    expect(probe.streams).toHaveLength(1);
    expect(probe.streams[0].codec_name).toBe('mp3');
    expect(probe.streams[0].sample_rate).toBe('16000');
    expect(probe.streams[0].channels).toBe(1);
  }, 15000);

  it('rechaza si el archivo de entrada no existe', async () => {
    await expect(
      service.convertToMp3(join(tmpdir(), 'no-existe.ogg'), mp3Path),
    ).rejects.toThrow(/ffmpeg/);
  });
});
