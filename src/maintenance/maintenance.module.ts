import { Module } from '@nestjs/common';
import { QueuesModule } from '../queues/queues.module';
import { MaintenanceProcessor } from './maintenance.processor';
import { MaintenanceScheduler } from './maintenance.scheduler';

@Module({
  imports: [QueuesModule],
  providers: [MaintenanceProcessor, MaintenanceScheduler],
})
export class MaintenanceModule {}
