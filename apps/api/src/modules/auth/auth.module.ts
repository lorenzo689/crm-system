import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtStrategy } from './strategies/jwt.strategies';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';

@Module({
    imports: [
        JwtModule.register({
            secret: process.env.JWT_SECRET ?? 'dev-secret-nur-lokal-aendern-vor-prod',
        }),
    ],
    providers: [JwtStrategy, AuthService],
    controllers: [AuthController],
    exports: [JwtModule],
})

export class AuthModule {}
