import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthMailService } from './auth-mail.service';
import {
  getJwtExpiresInSeconds,
  getJwtSecret,
  JWT_ALGORITHM,
} from './auth-config';
import { RolesGuard } from './guards/roles.guard';
import { SessionService } from './session.service';
import { JwtStrategy } from './strategies/jwt.strategies';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';

@Module({
  imports: [
    JwtModule.register({
      secret: getJwtSecret(),
      signOptions: {
        expiresIn: getJwtExpiresInSeconds(),
        algorithm: JWT_ALGORITHM,
      },
      verifyOptions: { algorithms: [JWT_ALGORITHM] },
    }),
  ],
  providers: [
    JwtStrategy,
    AuthMailService,
    AuthService,
    SessionService,
    RolesGuard,
  ],
  controllers: [AuthController],
  exports: [JwtModule, RolesGuard, SessionService],
})
export class AuthModule {}
