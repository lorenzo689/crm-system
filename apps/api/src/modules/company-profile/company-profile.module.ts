import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { CompanyProfileController } from './company-profile.controller';

@Module({
  imports: [AuthModule, UsersModule],
  controllers: [CompanyProfileController],
})
export class CompanyProfileModule {}
