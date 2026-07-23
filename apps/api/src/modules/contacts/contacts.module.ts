import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { ContactsController } from './contacts.controller';
import { ContactsRepository } from './contacts.repository';
import { ContactsService } from './contacts.service';

@Module({
  imports: [AuthModule, UsersModule],
  controllers: [ContactsController],
  providers: [ContactsService, ContactsRepository],
})
export class ContactsModule {}
