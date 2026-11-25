import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SalesDocumentsModule } from '../sales-documents/sales-documents.module';
import { UsersModule } from '../users/users.module';
import { RecurringInvoicesController } from './recurring-invoices.controller';
import { RecurringInvoicesService } from './recurring-invoices.service';

@Module({
  imports: [AuthModule, UsersModule, SalesDocumentsModule],
  controllers: [RecurringInvoicesController],
  providers: [RecurringInvoicesService],
})
export class RecurringInvoicesModule {}
