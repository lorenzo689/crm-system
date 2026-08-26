import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class RemindersSchedulerService {
  private readonly logger = new Logger(RemindersSchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async processDueReminders() {
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
      await this.processReminder(
        reminder.id,
        reminder.userId,
        reminder.calendarEvent,
      );
    }
  }

  private async processReminder(
    reminderId: string,
    userId: string,
    calendarEvent: { id: string; title: string; startsAt: Date },
  ) {
    try {
      const claimed = await this.prisma.reminder.updateMany({
        where: { id: reminderId, status: 'PENDING' },
        data: { status: 'SENT', sentAt: new Date() },
      });

      if (claimed.count === 0) {
        return;
      }

      const startTime = calendarEvent.startsAt.toLocaleTimeString('de-DE', {
        hour: '2-digit',
        minute: '2-digit',
      });

      await this.notificationsService.create({
        userId,
        type: 'CALENDAR_REMINDER',
        title: 'Terminerinnerung',
        message: `${calendarEvent.title} um ${startTime}`,
        reminderId,
      });
    } catch (error) {
      this.logger.error(`Failed to process reminder ${reminderId}`, error);

      await this.prisma.reminder
        .updateMany({
          where: { id: reminderId, status: 'SENT' },
          data: { status: 'FAILED' },
        })
        .catch(() => {
          this.logger.error(`Failed to mark reminder ${reminderId} as FAILED`);
        });
    }
  }
}
