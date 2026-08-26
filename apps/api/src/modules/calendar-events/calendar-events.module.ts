import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { CalendarEventsController } from './calendar-events.controller';
import { CalendarEventsRepository } from './calendar-events.repository';
import { CalendarEventsService } from './calendar-events.service';

@Module({
  imports: [AuthModule, UsersModule],
  controllers: [CalendarEventsController],
  providers: [CalendarEventsService, CalendarEventsRepository],
})
export class CalendarEventsModule {}
