import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { MessageType } from '@prisma/client';
import type { Job } from 'bullmq';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DebounceBufferService } from '../pipeline/debounce-buffer.service';
import { PrismaService } from '../prisma/prisma.service';
import { QUEUE_MEDIA } from '../queues/queues.constants';
import type { MessageQueueJob } from '../queues/queues.types';
import { TenantsService } from '../tenants/tenants.service';
import { FfmpegService } from './ffmpeg.service';
import { MediaDownloadService } from './media-download.service';
import { SttService } from './stt/stt.service';

@Processor(QUEUE_MEDIA)
export class MediaProcessor extends WorkerHost {
  private readonly logger = new Logger(MediaProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenants: TenantsService,
    private readonly debounceBuffer: DebounceBufferService,
    private readonly mediaDownload: MediaDownloadService,
    private readonly ffmpeg: FfmpegService,
    private readonly stt: SttService,
  ) {
    super();
  }

  async process(job: Job<MessageQueueJob>): Promise<void> {
    const { tenantId, leadId, messageId } = job.data;

    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
    });
    if (!message) {
      this.logger.warn(
        { messageId },
        'Message no encontrado, se ignora el job de media',
      );
      return;
    }

    if (message.type === MessageType.IMAGE) {
      await this.debounceBuffer.push(tenantId, leadId, {
        messageId,
        body: message.body ?? '[el lead envió una imagen]',
        type: message.type,
        createdAt: message.createdAt.toISOString(),
      });
      return;
    }

    if (message.type !== MessageType.AUDIO || !message.mediaId) {
      this.logger.warn(
        { messageId, type: message.type },
        'Tipo de media no manejado en MediaProcessor',
      );
      return;
    }

    const tenant = await this.tenants.findById(tenantId);
    if (!tenant) {
      this.logger.error(
        { tenantId },
        'Tenant no encontrado para procesar audio',
      );
      return;
    }

    const accessToken = this.tenants.getDecryptedAccessToken(tenant);
    const oggPath = join(tmpdir(), `wa-${messageId}.ogg`);
    const mp3Path = join(tmpdir(), `wa-${messageId}.mp3`);

    try {
      await this.mediaDownload.download(message.mediaId, accessToken, oggPath);
      await this.ffmpeg.convertToMp3(oggPath, mp3Path);
      const transcription = await this.stt.transcribe(mp3Path);

      const updated = await this.prisma.message.update({
        where: { id: messageId },
        data: { transcription },
      });

      await this.debounceBuffer.push(tenantId, leadId, {
        messageId,
        body: transcription,
        type: message.type,
        createdAt: updated.createdAt.toISOString(),
      });
    } finally {
      await Promise.all(
        [oggPath, mp3Path].map((path) =>
          fs.rm(path, { force: true }).catch(() => undefined),
        ),
      );
    }
  }
}
