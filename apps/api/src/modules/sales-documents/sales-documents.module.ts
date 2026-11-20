import { Module } from '@nestjs/common';
import { ActivitiesModule } from '../activities/activities.module';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { SalesDocumentsController } from './sales-documents.controller';
import { SalesDocumentsService } from './sales-documents.service';

@Module({
  imports: [AuthModule, UsersModule, ActivitiesModule],
  controllers: [SalesDocumentsController],
  exports: [SalesDocumentsService],
  providers: [SalesDocumentsService],
})
export class SalesDocumentsModule {}
