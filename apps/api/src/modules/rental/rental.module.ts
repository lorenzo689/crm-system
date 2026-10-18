import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { RentalController } from './rental.controller';
import { RentalService } from './rental.service';

@Module({
  imports: [AuthModule, UsersModule],
  controllers: [RentalController],
  providers: [RentalService],
  exports: [RentalService],
})
export class RentalModule {}
