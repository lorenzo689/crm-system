import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

type PasswordResetMailInput = {
  email: string;
  resetUrl: string;
  expiresAt: Date;
};

@Injectable()
export class AuthMailService {
  private readonly logger = new Logger(AuthMailService.name);
  private readonly mailFrom = process.env.MAIL_FROM;
  private readonly transporter = this.createTransporter();

  isConfigured() {
    return Boolean(this.mailFrom && this.transporter);
  }

  async sendPasswordReset(input: PasswordResetMailInput) {
    if (!this.mailFrom || !this.transporter) {
      throw new Error('SMTP mail transport is not configured');
    }

    await this.transporter.sendMail({
      from: this.mailFrom,
      to: input.email,
      subject: 'Bissinger OS Passwort zur\u00fccksetzen',
      text: [
        'Hallo,',
        '',
        'f\u00fcr dein Konto wurde ein Passwort-Reset angefordert.',
        `Bitte setze dein Passwort \u00fcber folgenden Link zur\u00fcck: ${input.resetUrl}`,
        `Der Link ist g\u00fcltig bis ${input.expiresAt.toLocaleString('de-DE')}.`,
        '',
        'Falls du den Reset nicht angefordert hast, kannst du diese E-Mail ignorieren.',
      ].join('\n'),
      html: [
        '<p>Hallo,</p>',
        '<p>f\u00fcr dein Konto wurde ein Passwort-Reset angefordert.</p>',
        `<p><a href="${input.resetUrl}">Passwort jetzt zur\u00fccksetzen</a></p>`,
        `<p>Der Link ist g\u00fcltig bis ${input.expiresAt.toLocaleString('de-DE')}.</p>`,
        '<p>Falls du den Reset nicht angefordert hast, kannst du diese E-Mail ignorieren.</p>',
      ].join(''),
    });

    this.logger.log(`Passwort-Reset-Mail an ${input.email} versendet`);
  }

  private createTransporter() {
    const host = process.env.SMTP_HOST;
    const port = Number.parseInt(process.env.SMTP_PORT ?? '1025', 10);
    const secure = process.env.SMTP_SECURE === 'true';
    const user = process.env.SMTP_USER;
    const password = process.env.SMTP_PASSWORD;

    if (!host || !this.mailFrom) {
      return null;
    }

    return nodemailer.createTransport({
      host,
      port,
      secure,
      auth: user ? { user, pass: password ?? '' } : undefined,
    });
  }
}
