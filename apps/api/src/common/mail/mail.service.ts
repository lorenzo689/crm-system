import { maskEmail } from './mask-email';
import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import * as nodemailer from 'nodemailer';

export type OutgoingMail = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
  attachments?: { filename: string; content: Buffer; contentType: string }[];
};

/** Shared SMTP transport (same settings as the password-reset mails). */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly from = process.env.MAIL_FROM;
  private readonly transporter = MailService.createTransporter();

  isConfigured() {
    return Boolean(this.from && this.transporter);
  }

  async send(mail: OutgoingMail) {
    if (!this.from || !this.transporter) {
      throw new ServiceUnavailableException(
        'E-Mail-Versand ist nicht konfiguriert (SMTP_HOST / MAIL_FROM)',
      );
    }
    const info = (await this.transporter.sendMail({
      from: this.from,
      ...mail,
    })) as { messageId?: string };
    // Subject and full address stay out of the log (customer data).
    this.logger.log(`Mail an ${maskEmail(mail.to)} versendet`);
    return { messageId: info.messageId ?? null };
  }

  private static createTransporter() {
    const host = process.env.SMTP_HOST;
    if (!host || !process.env.MAIL_FROM) return null;
    const user = process.env.SMTP_USER;
    return nodemailer.createTransport({
      host,
      port: Number.parseInt(process.env.SMTP_PORT ?? '1025', 10),
      secure: process.env.SMTP_SECURE === 'true',
      auth: user ? { user, pass: process.env.SMTP_PASSWORD ?? '' } : undefined,
    });
  }
}
