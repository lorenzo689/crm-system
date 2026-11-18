import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ACCOUNT_STATE_SELECT, getUsableMembership } from './account-status';
import { AuthMailService } from './auth-mail.service';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

const PASSWORD_RESET_TOKEN_BYTES = 32;
const PASSWORD_RESET_EXPIRY_MS = 60 * 60 * 1000;
const SALT_ROUNDS = 12;
const MAIL_SEND_TIMEOUT_MS = 8000;
const RESET_RESPONSE_MESSAGE =
  'Wenn ein Konto mit dieser E-Mail existiert, wurde ein Reset-Link vorbereitet.';

/** Minimum duration of every forgot-password answer (hides the mail-sending work). */
function getPasswordResetMinResponseMs() {
  const configured = Number(process.env.PASSWORD_RESET_MIN_RESPONSE_MS);
  return Number.isFinite(configured) && configured >= 0 ? configured : 1500;
}
const DUMMY_PASSWORD_HASH = bcrypt.hashSync(
  'not-the-right-password',
  SALT_ROUNDS,
);

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly authMailService: AuthMailService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findFirst({
      where: { email: { equals: dto.email.trim(), mode: 'insensitive' } },
      select: ACCOUNT_STATE_SELECT,
    });

    // Always run bcrypt so response time does not reveal whether the account exists.
    const passwordHash = user?.passwordHash ?? DUMMY_PASSWORD_HASH;
    const isValid = await bcrypt.compare(dto.password, passwordHash);

    // One message for every failure (unknown account, wrong password, locked
    // account, suspended organization) so nothing is revealed to the caller.
    if (!user || !user.passwordHash || !isValid || !getUsableMembership(user)) {
      throw new UnauthorizedException('E-Mail oder Passwort falsch');
    }

    return this.buildAuthResponse(user.id, user.email, user.tokenVersion);
  }

  /**
   * Always answers the same way (status and body), whether or not the address
   * belongs to an account, and whether or not mail delivery works. Delivery is
   * attempted inside the request (no unreliable work after the response), its
   * failures are logged without token or link, and the response time is padded
   * to a minimum so the extra work for real accounts is not observable.
   */
  async forgotPassword(dto: ForgotPasswordDto) {
    const startedAt = Date.now();
    try {
      await this.issueResetMail(dto.email);
    } catch (error) {
      // Never reveal delivery problems to the caller and never log the link.
      this.logger.error(
        `Passwort-Reset konnte nicht zugestellt werden (${
          error instanceof Error ? error.name : 'unbekannter Fehler'
        })`,
      );
    }

    const minimumMs = getPasswordResetMinResponseMs();
    const remaining = minimumMs - (Date.now() - startedAt);
    if (remaining > 0) {
      await new Promise((resolve) => setTimeout(resolve, remaining));
    }

    return { message: RESET_RESPONSE_MESSAGE };
  }

  private async issueResetMail(emailInput: string) {
    const user = await this.prisma.user.findFirst({
      where: { email: { equals: emailInput.trim(), mode: 'insensitive' } },
      select: { id: true, email: true, archivedAt: true },
    });
    if (!user || user.archivedAt) {
      return;
    }

    const token = randomBytes(PASSWORD_RESET_TOKEN_BYTES).toString('hex');
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_EXPIRY_MS);
    const now = new Date();

    await this.prisma.$transaction([
      this.prisma.passwordResetToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: now },
      }),
      this.prisma.passwordResetToken.create({
        data: { userId: user.id, token: hashToken(token), expiresAt },
      }),
    ]);

    const resetUrl = this.buildPasswordResetUrl(token);
    if (!this.authMailService.isConfigured()) {
      if (process.env.NODE_ENV === 'development') {
        // Local convenience only; production refuses to start without SMTP.
        this.logger.warn(
          `SMTP nicht konfiguriert, Reset-Link nur lokal im Log: ${resetUrl}`,
        );
        return;
      }
      throw new Error('SMTP nicht konfiguriert');
    }

    const delivery = { email: user.email, resetUrl, expiresAt };
    try {
      await this.sendWithTimeout(delivery);
    } catch {
      // One retry covers a transient SMTP hiccup.
      await this.sendWithTimeout(delivery);
    }
  }

  private async sendWithTimeout(
    delivery: Parameters<AuthMailService['sendPasswordReset']>[0],
  ) {
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        this.authMailService.sendPasswordReset(delivery),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error('SMTP timeout')),
            MAIL_SEND_TIMEOUT_MS,
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  async resetPassword(dto: ResetPasswordDto) {
    const tokenHash = hashToken(dto.token);
    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);
    const now = new Date();

    const reset = await this.prisma.$transaction(async (tx) => {
      // Consuming the token is a single conditional UPDATE, so two parallel
      // requests with the same link cannot both succeed.
      const consumed = await tx.passwordResetToken.updateMany({
        where: { token: tokenHash, usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
      });
      if (consumed.count !== 1) {
        return false;
      }

      const token = await tx.passwordResetToken.findUniqueOrThrow({
        where: { token: tokenHash },
        select: { userId: true },
      });
      await tx.user.update({
        where: { id: token.userId },
        // Bumping tokenVersion invalidates every JWT issued before the reset.
        data: { passwordHash, tokenVersion: { increment: 1 } },
      });
      await tx.passwordResetToken.updateMany({
        where: { userId: token.userId, usedAt: null },
        data: { usedAt: now },
      });
      return true;
    });

    if (!reset) {
      throw new BadRequestException(
        'Reset-Link ist ungültig oder bereits abgelaufen',
      );
    }

    return {
      message: 'Passwort wurde erfolgreich zurückgesetzt',
    };
  }

  private buildAuthResponse(
    userId: string,
    email: string,
    tokenVersion: number,
  ) {
    const accessToken = this.jwtService.sign({
      sub: userId,
      email,
      tv: tokenVersion,
    });
    return { accessToken };
  }

  private buildPasswordResetUrl(token: string) {
    const webOrigin = process.env.WEB_ORIGIN ?? 'http://localhost:3000';
    return `${webOrigin}/reset-password?token=${token}`;
  }
}
