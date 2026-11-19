import {
  ArgumentsHost,
  Body,
  Catch,
  Controller,
  ExceptionFilter,
  Get,
  HttpCode,
  HttpException,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { CSRF_HEADER } from './csrf';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { JsonBodyGuard } from './guards/json-body.guard';
import { JwtAuthGuard } from './guards/jwt-auth-guard';
import {
  clearSessionCookie,
  readSessionCookie,
  setSessionCookie,
} from './session-cookie';
import type { AuthUser } from './strategies/jwt.strategies';

/** A dead session cookie is removed as soon as the session probe rejects it. */
@Catch(UnauthorizedException)
class ClearSessionCookieOnUnauthorized
  extends BaseExceptionFilter
  implements ExceptionFilter
{
  catch(exception: HttpException, host: ArgumentsHost) {
    clearSessionCookie(host.switchToHttp().getResponse<Response>());
    super.catch(exception, host);
  }
}

// There is deliberately no registration route: accounts are provisioned by
// administrators through the CLI (see docs/security/sprint-1-auth-hardening.md).
// Every response under /auth is sent with Cache-Control: no-store (app-setup).
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @UseGuards(JsonBodyGuard)
  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { issued, body } = await this.authService.login(
      dto,
      readSessionCookie(req),
    );
    setSessionCookie(res, issued.cookieValue, issued.expiresAt);
    return body;
  }

  @UseGuards(JwtAuthGuard)
  @UseFilters(ClearSessionCookieOnUnauthorized)
  @Get('session')
  async session(@Req() req: Request) {
    return this.authService.getSession(req.user as AuthUser);
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.authService.logout(
      readSessionCookie(req),
      req.headers[CSRF_HEADER],
    );
    clearSessionCookie(res);
  }

  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @UseGuards(JsonBodyGuard)
  @Post('forgot-password')
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @UseGuards(JsonBodyGuard)
  @Post('reset-password')
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }
}
