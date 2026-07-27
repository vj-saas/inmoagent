import { Module } from '@nestjs/common';
import { AppointmentsService } from './appointments.service';
import { PublicAppointmentsController } from './public-appointments.controller';
import { PushNotificationsModule } from '../push-notifications/push-notifications.module';

@Module({
  imports: [PushNotificationsModule],
  controllers: [PublicAppointmentsController],
  providers: [AppointmentsService],
  exports: [AppointmentsService],
})
export class AppointmentsModule {}
