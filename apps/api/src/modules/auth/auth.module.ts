import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtStrategy } from './strategies/jwt.strategies';

@Module({
    imports: [
        JwtModule.register({
            secret: process.env.JWT_SECRET ?? 'dev-secret-nur-lokal-aendern-vor-prod',
        }),
    ],
    providers: [JwtStrategy],
    exports: [JwtModule],
})

export class AuthModule {}