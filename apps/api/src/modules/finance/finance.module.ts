import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SalesDocumentsModule } from '../sales-documents/sales-documents.module';
import { UsersModule } from '../users/users.module';
import { FinanceController } from './finance.controller';
import { FinanceService } from './finance.service';

@Module({
  imports: [AuthModule, UsersModule, SalesDocumentsModule],
  controllers: [FinanceController],
  providers: [FinanceService],
  exports: [FinanceService],
})
export class FinanceModule {}
