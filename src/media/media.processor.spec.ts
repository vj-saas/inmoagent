import { MessageType, type Message, type Tenant } from '@prisma/client';
import type { Job } from 'bullmq';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import type { DebounceBufferService } from '../pipeline/debounce-buffer.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { MessageQueueJob } from '../queues/queues.types';
import type { TenantsService } from '../tenants/tenants.service';
import type { FfmpegService } from './ffmpeg.service';
import { MediaProcessor } from './media.processor';
import type { MediaDownloadService } from './media-download.service';
import type { SttService } from './stt/stt.service';

const TENANT = { id: 'tenant-1', phoneNumberId: 'phone-1' } as Tenant;

function build(message: Partial<Message>) {
  const prisma = {
    message: {
      findUnique: jest.fn().mockResolvedValue(message),
      update: jest
        .fn()
        .mockImplementation(({ data }: { data: { transcription: string } }) =>
          Promise.resolve({
            ...message,
            ...data,
            createdAt: new Date('2026-01-01T00:00:00Z'),
          }),
        ),
    },
  } as unknown as PrismaService;
  const tenants = {
    findById: jest.fn().mockResolvedValue(TENANT),
    getDecryptedAccessToken: jest.fn().mockReturnValue('token-abc'),
  } as unknown as TenantsService;
  const debounceBuffer = {
    push: jest.fn().mockResolvedValue(undefined),
  } as unknown as DebounceBufferService;
  const mediaDownload = {
    download: jest.fn().mockResolvedValue(undefined),
  } as unknown as MediaDownloadService;
  const ffmpeg = {
    convertToMp3: jest.fn().mockResolvedValue(undefined),
  } as unknown as FfmpegService;
  const stt = {
    transcribe: jest.fn().mockResolvedValue('transcripción de prueba'),
  } as unknown as SttService;

  const processor = new MediaProcessor(
    prisma,
    tenants,
    debounceBuffer,
    mediaDownload,
    ffmpeg,
    stt,
  );
  return {
    processor,
    prisma,
    tenants,
    debounceBuffer,
    mediaDownload,
    ffmpeg,
    stt,
  };
}

function job(): Job<MessageQueueJob> {
  return {
    data: { tenantId: 'tenant-1', leadId: 'lead-1', messageId: 'message-1' },
  } as Job<MessageQueueJob>;
}

describe('MediaProcessor', () => {
  it('descarga, convierte y transcribe audio, persiste transcription y empuja al debounce', async () => {
    const { processor, prisma, mediaDownload, ffmpeg, stt, debounceBuffer } =
      build({
        id: 'message-1',
        type: MessageType.AUDIO,
        mediaId: 'media-1',
        body: null,
        createdAt: new Date('2026-01-01T00:00:00Z'),
      });

    await processor.process(job());

    expect(mediaDownload.download).toHaveBeenCalledWith(
      'media-1',
      'token-abc',
      expect.stringContaining('message-1'),
    );
    expect(ffmpeg.convertToMp3).toHaveBeenCalled();
    expect(stt.transcribe).toHaveBeenCalled();
    expect(prisma.message.update).toHaveBeenCalledWith({
      where: { id: 'message-1' },
      data: { transcription: 'transcripción de prueba' },
    });
    expect(debounceBuffer.push).toHaveBeenCalledWith(
      'tenant-1',
      'lead-1',
      expect.objectContaining({
        body: 'transcripción de prueba',
        type: MessageType.AUDIO,
      }),
    );
  });

  it('no deja archivos temporales huérfanos, incluso si la transcripción falla', async () => {
    const { processor, stt } = build({
      id: 'message-1',
      type: MessageType.AUDIO,
      mediaId: 'media-1',
      body: null,
      createdAt: new Date(),
    });
    (stt.transcribe as jest.Mock).mockRejectedValue(new Error('STT caído'));

    await expect(processor.process(job())).rejects.toThrow('STT caído');

    const tmpFiles = await fs.readdir(tmpdir());
    const orphaned = tmpFiles.filter((f) => f.includes('message-1'));
    expect(orphaned).toHaveLength(0);
  });

  it('imágenes se empujan directo al debounce con su caption, sin ffmpeg/STT', async () => {
    const { processor, debounceBuffer, ffmpeg, stt } = build({
      id: 'message-1',
      type: MessageType.IMAGE,
      mediaId: 'media-1',
      body: 'esta es la fachada',
      createdAt: new Date(),
    });

    await processor.process(job());

    expect(ffmpeg.convertToMp3).not.toHaveBeenCalled();
    expect(stt.transcribe).not.toHaveBeenCalled();
    expect(debounceBuffer.push).toHaveBeenCalledWith(
      'tenant-1',
      'lead-1',
      expect.objectContaining({
        body: 'esta es la fachada',
        type: MessageType.IMAGE,
      }),
    );
  });
});
