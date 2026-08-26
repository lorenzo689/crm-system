import { Module } from '@nestjs/common';
import { ActivitiesModule } from '../activities/activities.module';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { UsersModule } from '../users/users.module';
import { CalendarEventsController } from './calendar-events.controller';
import { CalendarEventsRepository } from './calendar-events.repository';
import { CalendarEventsService } from './calendar-events.service';
import { RemindersSchedulerService } from './reminders-scheduler.service';

@Module({
  imports: [AuthModule, UsersModule, ActivitiesModule, NotificationsModule],
  controllers: [CalendarEventsController],
  providers: [
    CalendarEventsService,
    CalendarEventsRepository,
    RemindersSchedulerService,
  ],
})
export class CalendarEventsModule {}
