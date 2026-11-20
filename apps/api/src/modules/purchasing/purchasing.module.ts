import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { PurchasingController } from './purchasing.controller';
import { PurchasingService } from './purchasing.service';

@Module({
  imports: [AuthModule, UsersModule],
  controllers: [PurchasingController],
  exports: [PurchasingService],
  providers: [PurchasingService],
})
export class PurchasingModule {}
