import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ActivitiesService } from '../activities/activities.service';
import {
  CalendarEventListFilters,
  CalendarEventsRepository,
} from './calendar-events.repository';
import { CreateCalendarEventDto } from './dto/create-calendar-event.dto';
import { UpdateCalendarEventDto } from './dto/update-calendar-event.dto';

function resolveActivityContext(event: {
  customerId: string | null;
  projectId: string | null;
}) {
  if (event.projectId) return { projectId: event.projectId };
  if (event.customerId) return { customerId: event.customerId };
  return null;
}

@Injectable()
export class CalendarEventsService {
  constructor(
    private readonly calendarEventsRepository: CalendarEventsRepository,
    private readonly prisma: PrismaService,
    private readonly activitiesService: ActivitiesService,
  ) {}

  private assertValidTimeRange(startsAt: string, endsAt: string) {
    if (new Date(endsAt) <= new Date(startsAt)) {
      throw new BadRequestException('endsAt must be after startsAt');
    }
  }

  private async assertValidContext(
    organizationId: string,
    context: { customerId?: string; projectId?: string },
  ) {
    const customer = context.customerId
      ? await this.prisma.customer.findFirst({
          where: { id: context.customerId, organizationId },
        })
      : null;
    if (context.customerId && !customer) {
      throw new NotFoundException('Customer not found');
    }

    const project = context.projectId
      ? await this.prisma.project.findFirst({
          where: { id: context.projectId, organizationId },
        })
      : null;
    if (context.projectId && !project) {
      throw new NotFoundException('Project not found');
    }

    if (customer && project && project.customerId !== customer.id) {
      throw new BadRequestException(
        'Project does not belong to the specified customer',
      );
    }
  }

  async findAll(organizationId: string, filters: CalendarEventListFilters) {
    return this.calendarEventsRepository.findAll(organizationId, filters);
  }

  async findOne(id: string, organizationId: string) {
    const event = await this.calendarEventsRepository.findById(
      id,
      organizationId,
    );
    if (!event) {
      throw new NotFoundException('Calendar event not found');
    }
    return event;
  }

  async create(
    organizationId: string,
    createdByUserId: string,
    dto: CreateCalendarEventDto,
  ) {
    this.assertValidTimeRange(dto.startsAt, dto.endsAt);
    await this.assertValidContext(organizationId, dto);

    const event = await this.calendarEventsRepository.create({
      ...dto,
      startsAt: new Date(dto.startsAt),
      endsAt: new Date(dto.endsAt),
      organizationId,
      createdByUserId,
    });

    const context = resolveActivityContext(event);
    if (context) {
      await this.activitiesService.log({
        ...context,
        actorUserId: createdByUserId,
        type: 'CALENDAR_EVENT_CREATED',
        message: `Termin "${event.title}" wurde angelegt`,
      });
    }

    return event;
  }

  async update(
    id: string,
    organizationId: string,
    actorUserId: string,
    dto: UpdateCalendarEventDto,
  ) {
    const existing = await this.findOne(id, organizationId);

    const nextStartsAt = dto.startsAt ?? existing.startsAt.toISOString();
    const nextEndsAt = dto.endsAt ?? existing.endsAt.toISOString();
    this.assertValidTimeRange(nextStartsAt, nextEndsAt);

    const updated = await this.calendarEventsRepository.update(id, {
      ...dto,
      startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
      endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
    });

    const context = resolveActivityContext(updated);
    if (context) {
      await this.activitiesService.log({
        ...context,
        actorUserId,
        type: 'CALENDAR_EVENT_UPDATED',
        message: `Termin "${updated.title}" wurde bearbeitet`,
      });
    }

    return updated;
  }

  async cancel(id: string, organizationId: string, actorUserId: string) {
    const existing = await this.findOne(id, organizationId);
    const cancelled = await this.calendarEventsRepository.cancel(id);

    const context = resolveActivityContext(existing);
    if (context) {
      await this.activitiesService.log({
        ...context,
        actorUserId,
        type: 'CALENDAR_EVENT_CANCELLED',
        message: `Termin "${existing.title}" wurde storniert`,
      });
    }

    return cancelled;
  }

  async archive(id: string, organizationId: string) {
    await this.findOne(id, organizationId);
    return this.calendarEventsRepository.archive(id);
  }

  async addReminder(
    calendarEventId: string,
    organizationId: string,
    userId: string,
    remindAt: string,
  ) {
    const event = await this.findOne(calendarEventId, organizationId);

    const remindAtDate = new Date(remindAt);
    if (remindAtDate >= event.startsAt) {
      throw new BadRequestException(
        'Reminder must be set before the event starts',
      );
    }
    if (remindAtDate <= new Date()) {
      throw new BadRequestException('Reminder time must be in the future');
    }

    return this.calendarEventsRepository.addReminder(
      calendarEventId,
      userId,
      remindAtDate,
    );
  }

  async findReminders(
    calendarEventId: string,
    organizationId: string,
    userId: string,
  ) {
    await this.findOne(calendarEventId, organizationId);
    return this.calendarEventsRepository.findReminders(calendarEventId, userId);
  }

  async cancelReminder(reminderId: string, userId: string) {
    const reminder =
      await this.calendarEventsRepository.findReminderById(reminderId);
    if (!reminder) {
      throw new NotFoundException('Reminder not found');
    }
    if (reminder.userId !== userId) {
      throw new NotFoundException('Reminder not found');
    }
    return this.calendarEventsRepository.cancelReminder(reminderId);
  }
}
