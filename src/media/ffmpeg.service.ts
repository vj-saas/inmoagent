import { Injectable } from '@nestjs/common';
import { spawn } from 'node:child_process';

/** Conversión de audio vía el binario `ffmpeg` del sistema (spawn directo, sin wrapper). */
@Injectable()
export class FfmpegService {
  /** Convierte `inputPath` (.ogg/.m4a/etc) a `outputPath` en mp3 mono 16kHz. */
  convertToMp3(inputPath: string, outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', [
        '-y',
        '-i',
        inputPath,
        '-ac',
        '1',
        '-ar',
        '16000',
        '-codec:a',
        'libmp3lame',
        outputPath,
      ]);

      let stderr = '';
      ffmpeg.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      ffmpeg.on('error', (error) => {
        reject(new Error(`No se pudo ejecutar ffmpeg: ${error.message}`));
      });

      ffmpeg.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(
            new Error(
              `ffmpeg terminó con código ${code}: ${stderr.slice(-1000)}`,
            ),
          );
        }
      });
    });
  }
}
