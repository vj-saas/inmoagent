import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { PushNotificationService } from './push-notification.service';

@Module({
  imports: [PrismaModule, ConfigModule],
  providers: [PushNotificationService],
  exports: [PushNotificationService],
})
export class PushNotificationsModule {}
