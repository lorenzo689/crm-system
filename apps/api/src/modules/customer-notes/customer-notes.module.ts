import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { CustomerNotesController } from './customer-notes.controller';
import { CustomerNotesRepository } from './customer-notes.repository';
import { CustomerNotesService } from './customer-notes.service';

@Module({
  imports: [AuthModule, UsersModule],
  controllers: [CustomerNotesController],
  providers: [CustomerNotesService, CustomerNotesRepository],
})
export class CustomerNotesModule {}
