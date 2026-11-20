import { Module } from '@nestjs/common';
import { UsersAdminService } from './users-admin.service';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  providers: [UsersService, UsersAdminService],
  controllers: [UsersController],
  exports: [UsersService],
})
export class UsersModule {}
