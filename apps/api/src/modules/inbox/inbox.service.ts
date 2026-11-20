import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import {
  InboundEmail,
  InboundEmailStatus,
  Prisma,
} from '../../../generated/prisma/client';
import {
  BackgroundJobsService,
  JobLeaseLostError,
  type JobContext,
} from '../../common/jobs/background-jobs.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AiChatService } from '../ai/ai-chat.service';
import { AiProposalsService } from '../ai/ai-proposals.service';

const MAX_BODY_CHARS = 50_000;
const MAX_MESSAGES_PER_POLL = 50;

export type ParsedMail = {
  messageId: string;
  fromAddress: string;
  fromName?: string;
  subject: string;
  text: string;
  receivedAt: Date;
};

@Injectable()
export class InboxService {
  private readonly logger = new Logger(InboxService.name);
  private isPolling = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiChatService,
    private readonly proposals: AiProposalsService,
    private readonly jobs?: BackgroundJobsService,
  ) {}

  isConfigured() {
    return Boolean(
      process.env.IMAP_HOST &&
      process.env.IMAP_USER &&
      process.env.IMAP_PASSWORD,
    );
  }

  list(organizationId: string, status?: InboundEmailStatus) {
    return this.prisma.inboundEmail.findMany({
      where: { organizationId, ...(status && { status }) },
      include: { customer: { select: { id: true, name: true } } },
      orderBy: { receivedAt: 'desc' },
      take: 200,
    });
  }

  async setStatus(
    id: string,
    organizationId: string,
    status: InboundEmailStatus,
  ) {
    await this.prisma.inboundEmail.findFirstOrThrow({
      where: { id, organizationId },
      select: { id: true },
    });
    return this.prisma.inboundEmail.update({ where: { id }, data: { status } });
  }

  @Cron('*/5 * * * *', { name: 'inbox-poll' })
  async pollScheduledJob() {
    await this.jobs?.run('inbox-poll', (context) =>
      this.pollScheduled(context),
    );
  }

  async pollScheduled(context?: JobContext) {
    if (!this.isConfigured()) return;
    try {
      await this.poll(context);
    } catch (error) {
      // A lost lease / shutdown ends the run without a misleading "failed" log.
      if (error instanceof JobLeaseLostError) throw error;
      this.logger.error(
        `Posteingang konnte nicht abgerufen werden: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /** Fetches unread mails from the configured IMAP inbox and ingests them. */
  async poll(context?: JobContext) {
    if (!this.isConfigured()) {
      return { configured: false, imported: 0 };
    }
    if (this.isPolling) return { configured: true, imported: 0 };
    this.isPolling = true;

    const organizationId = await this.inboxOrganizationId();
    const client = new ImapFlow({
      host: process.env.IMAP_HOST!,
      port: Number(process.env.IMAP_PORT) || 993,
      secure: process.env.IMAP_SECURE !== 'false',
      auth: { user: process.env.IMAP_USER!, pass: process.env.IMAP_PASSWORD! },
      logger: false,
    });

    let imported = 0;
    // Cooperative cancellation: closing the connection interrupts a pending
    // IMAP command at once when the lease is lost or the process shuts down.
    const closeOnAbort = () => client.close();
    context?.signal.addEventListener('abort', closeOnAbort, { once: true });
    try {
      await client.connect();
      const lock = await client.getMailboxLock(
        process.env.IMAP_MAILBOX || 'INBOX',
      );
      try {
        const uids =
          (await client.search({ seen: false }, { uid: true })) || [];
        for (const uid of uids.slice(0, MAX_MESSAGES_PER_POLL)) {
          // Every mail is idempotent (unique messageId); stopping between two
          // mails is safe, the rest stays unseen for the next run.
          context?.assertLeaseHeld();
          const message = await client.fetchOne(
            String(uid),
            { source: true },
            { uid: true },
          );
          if (!message || !message.source) continue;
          const parsed = await simpleParser(message.source);
          const from = parsed.from?.value[0];
          const created = await this.ingest(organizationId, {
            messageId:
              parsed.messageId ??
              `uid-${uid}-${parsed.date?.getTime() ?? Date.now()}`,
            fromAddress: from?.address ?? 'unbekannt',
            fromName: from?.name || undefined,
            subject: parsed.subject ?? '(ohne Betreff)',
            text: parsed.text ?? '',
            receivedAt: parsed.date ?? new Date(),
          });
          await client.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true });
          if (created) imported++;
        }
      } finally {
        lock.release();
      }
      await client.logout();
    } finally {
      context?.signal.removeEventListener('abort', closeOnAbort);
      this.isPolling = false;
    }
    return { configured: true, imported };
  }

  /**
   * Stores a mail, links it to a customer via a known contact address and,
   * when the AI is configured, lets it suggest a follow-up task.
   * Returns null for mails that were already imported.
   */
  async ingest(
    organizationId: string,
    mail: ParsedMail,
  ): Promise<InboundEmail | null> {
    const contact = await this.prisma.contact.findFirst({
      where: {
        organizationId,
        archivedAt: null,
        email: { equals: mail.fromAddress, mode: 'insensitive' },
      },
      select: { customerId: true },
    });

    let email: InboundEmail;
    try {
      email = await this.prisma.inboundEmail.create({
        data: {
          organizationId,
          messageId: mail.messageId.slice(0, 500),
          fromAddress: mail.fromAddress.slice(0, 254),
          fromName: mail.fromName?.slice(0, 200),
          subject: mail.subject.slice(0, 500),
          textBody: mail.text.slice(0, MAX_BODY_CHARS),
          receivedAt: mail.receivedAt,
          customerId: contact?.customerId ?? null,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return null;
      }
      throw error;
    }

    if (!this.ai.isConfigured()) return email;

    try {
      const triage = await this.ai.triageEmail({
        from: mail.fromName
          ? `${mail.fromName} <${mail.fromAddress}>`
          : mail.fromAddress,
        subject: mail.subject,
        text: mail.text,
      });
      if (!triage) return email;

      email = await this.prisma.inboundEmail.update({
        where: { id: email.id },
        data: {
          category: triage.category,
          aiSummary: triage.summary.slice(0, 1000),
          ...(triage.category === 'SPAM' && { status: 'IGNORED' }),
        },
      });

      if (
        triage.needsAction &&
        triage.taskTitle.trim() &&
        triage.category !== 'SPAM'
      ) {
        await this.proposals.create({
          organizationId,
          source: 'AGENT',
          kind: 'CREATE_TASK',
          title: `E-Mail: ${triage.taskTitle.trim().slice(0, 150)}`,
          summary: `${mail.fromName ?? mail.fromAddress}: ${triage.summary}`,
          payload: {
            title: triage.taskTitle.trim().slice(0, 200),
            description: `Aus E-Mail von ${mail.fromAddress} (Betreff: ${mail.subject})\n\n${triage.summary}`,
            priority: triage.priority,
          },
          dedupeKey: `email:${email.id}`,
        });
      }
    } catch (error) {
      this.logger.warn(
        `E-Mail ${email.id} konnte nicht eingeordnet werden: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    return email;
  }

  private async inboxOrganizationId() {
    const slug = process.env.INBOX_ORGANIZATION_SLUG || 'bissinger-lights';
    const organization = await this.prisma.organization.findUniqueOrThrow({
      where: { slug },
      select: { id: true },
    });
    return organization.id;
  }
}
