import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  BackgroundJobsService,
  JobLeaseLostError,
  type JobContext,
} from '../../common/jobs/background-jobs.service';
import type { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class RemindersSchedulerService {
  private readonly logger = new Logger(RemindersSchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly jobs: BackgroundJobsService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE, { name: 'calendar-reminders' })
  async processDueRemindersScheduled() {
    await this.jobs.run('calendar-reminders', (context) =>
      this.processDueReminders(context),
    );
  }

  async processDueReminders(context?: JobContext) {
    const now = new Date();

    const dueReminders = await this.prisma.reminder.findMany({
      where: {
        status: 'PENDING',
        remindAt: { lte: now },
      },
      include: {
        calendarEvent: true,
      },
    });

    if (dueReminders.length === 0) {
      return;
    }

    this.logger.log(`Processing ${dueReminders.length} due reminder(s)`);

    for (const reminder of dueReminders) {
      // Stops at once when the lease is lost or the process shuts down; the
      // remaining reminders are still PENDING and picked up by the next run.
      context?.assertLeaseHeld();
      await this.processReminder(
        reminder.id,
        reminder.userId,
        reminder.calendarEvent,
        context,
      );
    }
  }

  private async processReminder(
    reminderId: string,
    userId: string,
    calendarEvent: { id: string; title: string; startsAt: Date },
    context?: JobContext,
  ) {
    try {
      const userSettings = await this.prisma.userSetting.findUnique({
        where: { userId },
        select: { notificationsEnabled: true, calendarReminders: true },
      });

      const notificationsAllowed =
        (userSettings?.notificationsEnabled ?? true) &&
        (userSettings?.calendarReminders ?? true);

      if (!notificationsAllowed) {
        const claimed = await this.prisma.reminder.updateMany({
          where: { id: reminderId, status: 'PENDING' },
          data: { status: 'CANCELLED' },
        });
        if (claimed.count > 0) {
          this.logger.log(
            `Reminder ${reminderId} cancelled: notifications disabled for user`,
          );
        }
        return;
      }

      const startTime = calendarEvent.startsAt.toLocaleTimeString('de-DE', {
        hour: '2-digit',
        minute: '2-digit',
      });

      // Claim and notification in ONE transaction (fenced by the job lease): a
      // crash in between leaves the reminder PENDING (retried next minute), it
      // can neither be "sent" without notification nor produce two
      // notifications (reminderId is unique).
      const work = async (tx: Prisma.TransactionClient) => {
        const claimed = await tx.reminder.updateMany({
          where: { id: reminderId, status: 'PENDING' },
          data: { status: 'SENT', sentAt: new Date() },
        });
        if (claimed.count === 0) {
          return;
        }
        await tx.notification.create({
          data: {
            userId,
            type: 'CALENDAR_REMINDER',
            title: 'Terminerinnerung',
            message: `${calendarEvent.title} um ${startTime}`,
            reminderId,
          },
        });
      };
      await (context
        ? context.runFenced(work)
        : this.prisma.$transaction(work, { timeout: 30_000 }));
    } catch (error) {
      if (error instanceof JobLeaseLostError) throw error;
      this.logger.error(`Failed to process reminder ${reminderId}`, error);

      // The transaction rolled back, so the reminder is still PENDING; mark it
      // FAILED so a permanently broken reminder is not retried every minute.
      await this.prisma.reminder
        .updateMany({
          where: { id: reminderId, status: 'PENDING' },
          data: { status: 'FAILED' },
        })
        .catch(() => {
          this.logger.error(`Failed to mark reminder ${reminderId} as FAILED`);
        });
    }
  }
}
