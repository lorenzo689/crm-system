import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { ActivitiesModule } from '../activities/activities.module';
import { TasksController } from './tasks.controller';
import { TasksRepository } from './tasks.repository';
import { TasksService } from './tasks.service';

@Module({
  imports: [AuthModule, UsersModule, ActivitiesModule],
  controllers: [TasksController],
  exports: [TasksService],
  providers: [TasksService, TasksRepository],
})
export class TasksModule {}
