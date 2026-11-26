import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PurchasingModule } from '../purchasing/purchasing.module';
import { SalesDocumentsModule } from '../sales-documents/sales-documents.module';
import { RentalModule } from '../rental/rental.module';
import { ReportsModule } from '../reports/reports.module';
import { TasksModule } from '../tasks/tasks.module';
import { TimeTrackingModule } from '../time-tracking/time-tracking.module';
import { UsersModule } from '../users/users.module';
import { AiAgentsService } from './ai-agents.service';
import { AiChatService } from './ai-chat.service';
import { AiProposalsService } from './ai-proposals.service';
import { AiToolsService } from './ai-tools';
import { AiController } from './ai.controller';

@Module({
  imports: [
    AuthModule,
    UsersModule,
    TasksModule,
    SalesDocumentsModule,
    PurchasingModule,
    RentalModule,
    TimeTrackingModule,
    ReportsModule,
  ],
  controllers: [AiController],
  exports: [AiChatService, AiProposalsService],
  providers: [
    AiChatService,
    AiToolsService,
    AiProposalsService,
    AiAgentsService,
  ],
})
export class AiModule {}
