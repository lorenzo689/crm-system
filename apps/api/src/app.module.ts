import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { MailModule } from './common/mail/mail.module';
import { StorageModule } from './common/storage/storage.module';
import { ActivitiesModule } from './modules/activities/activities.module';
import { AiModule } from './modules/ai/ai.module';
import { ArticlesModule } from './modules/articles/articles.module';
import { AuthModule } from './modules/auth/auth.module';
import { CalendarEventsModule } from './modules/calendar-events/calendar-events.module';
import { CompanyProfileModule } from './modules/company-profile/company-profile.module';
import { ContactsModule } from './modules/contacts/contacts.module';
import { CustomersModule } from './modules/customers/customers.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { InboxModule } from './modules/inbox/inbox.module';
import { HealthModule } from './modules/health/health.module';
import { NotesModule } from './modules/notes/notes.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { PurchasingModule } from './modules/purchasing/purchasing.module';
import { FinanceModule } from './modules/finance/finance.module';
import { RecurringInvoicesModule } from './modules/recurring-invoices/recurring-invoices.module';
import { ReportsModule } from './modules/reports/reports.module';
import { TimeTrackingModule } from './modules/time-tracking/time-tracking.module';
import { RentalModule } from './modules/rental/rental.module';
import { SalesDocumentsModule } from './modules/sales-documents/sales-documents.module';
import { SearchModule } from './modules/search/search.module';
import { SettingsModule } from './modules/settings/settings.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { UsersModule } from './modules/users/users.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    StorageModule,
    MailModule,
    HealthModule,
    ActivitiesModule,
    AuthModule,
    CalendarEventsModule,
    UsersModule,
    CustomersModule,
    DashboardModule,
    ContactsModule,
    NotesModule,
    NotificationsModule,
    ProjectsModule,
    SearchModule,
    SettingsModule,
    TasksModule,
    DocumentsModule,
    ArticlesModule,
    SalesDocumentsModule,
    CompanyProfileModule,
    PurchasingModule,
    AiModule,
    InboxModule,
    RentalModule,
    FinanceModule,
    TimeTrackingModule,
    RecurringInvoicesModule,
    ReportsModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
