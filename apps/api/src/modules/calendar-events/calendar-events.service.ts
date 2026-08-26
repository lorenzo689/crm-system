import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  CalendarEventListFilters,
  CalendarEventsRepository,
} from './calendar-events.repository';
import { CreateCalendarEventDto } from './dto/create-calendar-event.dto';
import { UpdateCalendarEventDto } from './dto/update-calendar-event.dto';

@Injectable()
export class CalendarEventsService {
  constructor(
    private readonly calendarEventsRepository: CalendarEventsRepository,
    private readonly prisma: PrismaService,
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

    return this.calendarEventsRepository.create({
      ...dto,
      startsAt: new Date(dto.startsAt),
      endsAt: new Date(dto.endsAt),
      organizationId,
      createdByUserId,
    });
  }

  async update(
    id: string,
    organizationId: string,
    dto: UpdateCalendarEventDto,
  ) {
    const existing = await this.findOne(id, organizationId);

    const nextStartsAt = dto.startsAt ?? existing.startsAt.toISOString();
    const nextEndsAt = dto.endsAt ?? existing.endsAt.toISOString();
    this.assertValidTimeRange(nextStartsAt, nextEndsAt);

    return this.calendarEventsRepository.update(id, {
      ...dto,
      startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
      endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
    });
  }

  async cancel(id: string, organizationId: string) {
    await this.findOne(id, organizationId);
    return this.calendarEventsRepository.cancel(id);
  }

  async archive(id: string, organizationId: string) {
    await this.findOne(id, organizationId);
    return this.calendarEventsRepository.archive(id);
  }
}
