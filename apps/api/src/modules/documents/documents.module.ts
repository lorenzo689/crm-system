import { Module } from '@nestjs/common';
import { StorageModule } from '../../common/storage/storage.module';
import { ActivitiesModule } from '../activities/activities.module';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { DocumentsController } from './documents.controller';
import { DocumentsRepository } from './documents.repository';
import { DocumentsService } from './documents.service';
import { TextExtractionService } from './text-extraction.service';

@Module({
  imports: [AuthModule, UsersModule, StorageModule, ActivitiesModule],
  controllers: [DocumentsController],
  providers: [DocumentsService, DocumentsRepository, TextExtractionService],
})
export class DocumentsModule {}
