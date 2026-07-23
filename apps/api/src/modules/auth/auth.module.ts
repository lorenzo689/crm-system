import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthMailService } from './auth-mail.service';
import { JwtStrategy } from './strategies/jwt.strategies';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET ?? 'dev-secret-nur-lokal-aendern-vor-prod',
      signOptions: { expiresIn: '7d' },
    }),
  ],
  providers: [JwtStrategy, AuthMailService, AuthService],
  controllers: [AuthController],
  exports: [JwtModule],
})
export class AuthModule {}
