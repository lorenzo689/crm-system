import { Module } from '@nestjs/common';
import { HealthModule } from './modules/health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { CustomersModule } from './modules/customers/customers.module';

@Module({
  imports: [HealthModule, AuthModule, UsersModule, CustomersModule],
})
export class AppModule {}
