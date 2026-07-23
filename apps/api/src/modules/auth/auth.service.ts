import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthMailService } from './auth-mail.service';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

const BISSINGER_ORG_SLUG = 'bissinger-lights';
const PASSWORD_RESET_TOKEN_BYTES = 32;
const PASSWORD_RESET_EXPIRY_MS = 60 * 60 * 1000;
const SALT_ROUNDS = 10;
const DUMMY_PASSWORD_HASH = bcrypt.hashSync(
  'not-the-right-password',
  SALT_ROUNDS,
);

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly authMailService: AuthMailService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('E-Mail wird bereits verwendet');
    }

    const organization = await this.prisma.organization.findUnique({
      where: { slug: BISSINGER_ORG_SLUG },
    });
    if (!organization) {
      throw new InternalServerErrorException(
        `Basis-Organisation "${BISSINGER_ORG_SLUG}" ist nicht eingerichtet. Bitte zuerst das Setup-Skript ausf\u00fchren (siehe README).`,
      );
    }

    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        displayName: dto.displayName,
        passwordHash,
        organizationRoles: {
          create: {
            organizationId: organization.id,
            role: 'MEMBER',
          },
        },
      },
    });

    return this.buildAuthResponse(user.id, user.email);
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    const passwordHash = user?.passwordHash ?? DUMMY_PASSWORD_HASH;
    const isValid = await bcrypt.compare(dto.password, passwordHash);

    if (!user || !user.passwordHash || !isValid) {
      throw new UnauthorizedException('E-Mail oder Passwort falsch');
    }

    return this.buildAuthResponse(user.id, user.email);
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { id: true, email: true },
    });

    if (!user) {
      return {
        message:
          'Wenn ein Konto mit dieser E-Mail existiert, wurde ein Reset-Link vorbereitet.',
      };
    }

    const token = randomBytes(PASSWORD_RESET_TOKEN_BYTES).toString('hex');
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_EXPIRY_MS);
    const now = new Date();

    await this.prisma.$transaction([
      this.prisma.passwordResetToken.updateMany({
        where: {
          userId: user.id,
          usedAt: null,
        },
        data: {
          usedAt: now,
        },
      }),
      this.prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          token,
          expiresAt,
        },
      }),
    ]);

    const resetUrl = this.buildPasswordResetUrl(token);
    const response: {
      message: string;
      resetToken?: string;
      resetUrl?: string;
      expiresAt?: string;
    } = {
      message:
        'Wenn ein Konto mit dieser E-Mail existiert, wurde ein Reset-Link vorbereitet.',
    };

    if (this.authMailService.isConfigured()) {
      await this.authMailService.sendPasswordReset({
        email: user.email,
        resetUrl,
        expiresAt,
      });
    } else if (process.env.NODE_ENV === 'development') {
      this.logger.warn(
        `SMTP nicht konfiguriert, Passwort-Reset-Link wird nur lokal bereitgestellt: ${resetUrl}`,
      );
      response.resetToken = token;
      response.resetUrl = resetUrl;
      response.expiresAt = expiresAt.toISOString();
    } else {
      throw new InternalServerErrorException(
        'Passwort-Reset-Mailversand ist nicht konfiguriert.',
      );
    }

    return response;
  }

  async resetPassword(dto: ResetPasswordDto) {
    const resetToken = await this.prisma.passwordResetToken.findUnique({
      where: { token: dto.token },
      select: {
        id: true,
        userId: true,
        expiresAt: true,
        usedAt: true,
      },
    });

    if (
      !resetToken ||
      resetToken.usedAt ||
      resetToken.expiresAt.getTime() <= Date.now()
    ) {
      throw new BadRequestException(
        'Reset-Link ist ung\u00fcltig oder bereits abgelaufen',
      );
    }

    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);
    const usedAt = new Date();

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: resetToken.userId },
        data: { passwordHash },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { usedAt },
      }),
      this.prisma.passwordResetToken.updateMany({
        where: {
          userId: resetToken.userId,
          usedAt: null,
          id: { not: resetToken.id },
        },
        data: { usedAt },
      }),
    ]);

    return {
      message: 'Passwort wurde erfolgreich zur\u00fcckgesetzt',
    };
  }

  private buildAuthResponse(userId: string, email: string) {
    const accessToken = this.jwtService.sign({ sub: userId, email });
    return { accessToken };
  }

  private buildPasswordResetUrl(token: string) {
    const webOrigin = process.env.WEB_ORIGIN ?? 'http://localhost:3000';
    return `${webOrigin}/reset-password?token=${token}`;
  }
}
