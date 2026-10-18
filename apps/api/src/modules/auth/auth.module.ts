import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthMailService } from './auth-mail.service';
import { getJwtSecret } from './jwt-secret';
import { JwtStrategy } from './strategies/jwt.strategies';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';

@Module({
  imports: [
    JwtModule.register({
      secret: getJwtSecret(),
      signOptions: { expiresIn: '12h', algorithm: 'HS256' },
      verifyOptions: { algorithms: ['HS256'] },
    }),
  ],
  providers: [JwtStrategy, AuthMailService, AuthService],
  controllers: [AuthController],
  exports: [JwtModule],
})
export class AuthModule {}
