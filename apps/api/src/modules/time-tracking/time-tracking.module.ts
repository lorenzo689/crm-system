import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SalesDocumentsModule } from '../sales-documents/sales-documents.module';
import { UsersModule } from '../users/users.module';
import { TimeTrackingController } from './time-tracking.controller';
import { TimeTrackingService } from './time-tracking.service';

@Module({
  imports: [AuthModule, UsersModule, SalesDocumentsModule],
  controllers: [TimeTrackingController],
  providers: [TimeTrackingService],
  exports: [TimeTrackingService],
})
export class TimeTrackingModule {}
