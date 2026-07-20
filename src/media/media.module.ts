import { Module } from '@nestjs/common';
import { PipelineModule } from '../pipeline/pipeline.module';
import { QueuesModule } from '../queues/queues.module';
import { TenantsModule } from '../tenants/tenants.module';
import { FfmpegService } from './ffmpeg.service';
import { MediaDownloadService } from './media-download.service';
import { MediaProcessor } from './media.processor';
import { GroqSttProvider } from './stt/groq-stt.provider';
import { OpenAiSttProvider } from './stt/openai-stt.provider';
import { SttService } from './stt/stt.service';

@Module({
  imports: [QueuesModule, TenantsModule, PipelineModule],
  providers: [
    MediaProcessor,
    MediaDownloadService,
    FfmpegService,
    SttService,
    GroqSttProvider,
    OpenAiSttProvider,
  ],
})
export class MediaModule {}
