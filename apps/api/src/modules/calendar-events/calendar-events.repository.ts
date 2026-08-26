import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

export type CalendarEventListFilters = {
  from?: Date;
  to?: Date;
  customerId?: string;
  projectId?: string;
  status?: Prisma.CalendarEventWhereInput['status'];
};

@Injectable()
export class CalendarEventsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(organizationId: string, filters: CalendarEventListFilters) {
    const where: Prisma.CalendarEventWhereInput = {
      organizationId,
      archivedAt: null,
      ...(filters.customerId && { customerId: filters.customerId }),
      ...(filters.projectId && { projectId: filters.projectId }),
      ...(filters.status && { status: filters.status }),
      ...(filters.from && { endsAt: { gte: filters.from } }),
      ...(filters.to && { startsAt: { lte: filters.to } }),
    };

    return this.prisma.calendarEvent.findMany({
      where,
      orderBy: { startsAt: 'asc' },
      include: {
        customer: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } },
        createdBy: { select: { id: true, displayName: true } },
      },
    });
  }

  async findById(id: string, organizationId: string) {
    return this.prisma.calendarEvent.findFirst({
      where: { id, organizationId },
      include: {
        customer: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } },
        createdBy: { select: { id: true, displayName: true } },
      },
    });
  }

  async create(data: Prisma.CalendarEventUncheckedCreateInput) {
    return this.prisma.calendarEvent.create({
      data,
      include: {
        customer: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } },
        createdBy: { select: { id: true, displayName: true } },
      },
    });
  }

  async update(id: string, data: Prisma.CalendarEventUpdateInput) {
    return this.prisma.calendarEvent.update({
      where: { id },
      data,
      include: {
        customer: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } },
        createdBy: { select: { id: true, displayName: true } },
      },
    });
  }

  async cancel(id: string) {
    return this.prisma.calendarEvent.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });
  }

  async archive(id: string) {
    return this.prisma.calendarEvent.update({
      where: { id },
      data: { archivedAt: new Date() },
    });
  }

  async addReminder(calendarEventId: string, userId: string, remindAt: Date) {
    return this.prisma.reminder.create({
      data: { calendarEventId, userId, remindAt },
    });
  }

  async findReminders(calendarEventId: string, userId: string) {
    return this.prisma.reminder.findMany({
      where: { calendarEventId, userId },
      orderBy: { remindAt: 'asc' },
    });
  }

  async findReminderById(id: string) {
    return this.prisma.reminder.findUnique({ where: { id } });
  }

  async cancelReminder(id: string) {
    return this.prisma.reminder.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });
  }
}
