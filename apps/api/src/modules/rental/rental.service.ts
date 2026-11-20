import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ReservationStatus } from '../../../generated/prisma/enums';
import { PrismaService } from '../../common/prisma/prisma.service';
import { minAvailable } from './availability';

export class CreateReservationDto {
  @IsUUID()
  articleId!: string;

  @IsInt()
  @Min(1)
  @Max(100_000)
  quantity!: number;

  @IsDateString()
  startsOn!: string;

  @IsDateString()
  endsOn!: string;

  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsUUID()
  projectId?: string;

  @IsOptional()
  @IsEnum(ReservationStatus)
  status?: 'TENTATIVE' | 'CONFIRMED';

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class ChangeReservationStatusDto {
  @IsEnum(ReservationStatus)
  status!: ReservationStatus;
}

export class ReservationQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsUUID()
  articleId?: string;

  @IsOptional()
  @IsUUID()
  projectId?: string;
}

export class AvailabilityQueryDto {
  @IsUUID()
  articleId!: string;

  @IsDateString()
  from!: string;

  @IsDateString()
  to!: string;
}

const ACTIVE: ReservationStatus[] = ['TENTATIVE', 'CONFIRMED'];

const TRANSITIONS: Partial<Record<ReservationStatus, ReservationStatus[]>> = {
  TENTATIVE: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['RETURNED', 'CANCELLED'],
};

const include = {
  article: {
    select: { id: true, articleNumber: true, name: true, rentalStock: true },
  },
  customer: { select: { id: true, name: true } },
  project: { select: { id: true, name: true } },
};

@Injectable()
export class RentalService {
  constructor(private readonly prisma: PrismaService) {}

  list(organizationId: string, query: ReservationQueryDto) {
    return this.prisma.reservation.findMany({
      where: {
        organizationId,
        ...(query.articleId && { articleId: query.articleId }),
        ...(query.projectId && { projectId: query.projectId }),
        // A reservation overlaps [from, to] when it starts before `to` and ends after `from`.
        ...(query.to && { startsOn: { lte: new Date(query.to) } }),
        ...(query.from && { endsOn: { gte: new Date(query.from) } }),
      },
      include,
      orderBy: [{ startsOn: 'asc' }, { createdAt: 'asc' }],
      take: 500,
    });
  }

  async availability(
    organizationId: string,
    articleId: string,
    from: string,
    to: string,
    excludeReservationId?: string,
  ) {
    const article = await this.prisma.article.findFirst({
      where: { id: articleId, organizationId },
      select: { id: true, name: true, isRentable: true, rentalStock: true },
    });
    if (!article) throw new NotFoundException('Article not found');
    const start = new Date(from);
    const end = new Date(to);
    if (end < start) throw new BadRequestException('End is before start');

    const bookings = await this.prisma.reservation.findMany({
      where: {
        organizationId,
        articleId,
        status: { in: ACTIVE },
        startsOn: { lte: end },
        endsOn: { gte: start },
        ...(excludeReservationId && { id: { not: excludeReservationId } }),
      },
      select: { quantity: true, startsOn: true, endsOn: true },
    });
    return {
      articleId,
      name: article.name,
      isRentable: article.isRentable,
      totalUnits: article.rentalStock,
      available: minAvailable(article.rentalStock, bookings, start, end),
    };
  }

  async create(
    organizationId: string,
    actorUserId: string,
    dto: CreateReservationDto,
  ) {
    const start = new Date(dto.startsOn);
    const end = new Date(dto.endsOn);
    if (end < start) throw new BadRequestException('End is before start');

    if (dto.customerId) {
      const customer = await this.prisma.customer.findFirst({
        where: { id: dto.customerId, organizationId },
        select: { id: true },
      });
      if (!customer) throw new BadRequestException('Customer not found');
    }
    if (dto.projectId) {
      const project = await this.prisma.project.findFirst({
        where: { id: dto.projectId, organizationId },
        select: { id: true },
      });
      if (!project) throw new BadRequestException('Project not found');
    }

    return this.prisma.$transaction(async (tx) => {
      // Serialises concurrent bookings of the same article so two requests
      // cannot both see the last free unit.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${dto.articleId}))`;

      const article = await tx.article.findFirst({
        where: { id: dto.articleId, organizationId, archivedAt: null },
        select: { isRentable: true, rentalStock: true, name: true },
      });
      if (!article) throw new BadRequestException('Article not found');
      if (!article.isRentable) {
        throw new BadRequestException(`"${article.name}" is not rentable`);
      }

      const bookings = await tx.reservation.findMany({
        where: {
          organizationId,
          articleId: dto.articleId,
          status: { in: ACTIVE },
          startsOn: { lte: end },
          endsOn: { gte: start },
        },
        select: { quantity: true, startsOn: true, endsOn: true },
      });
      const available = minAvailable(article.rentalStock, bookings, start, end);
      if (dto.quantity > available) {
        throw new ConflictException(
          `Nur ${available} von ${dto.quantity} Stück von "${article.name}" im Zeitraum verfügbar`,
        );
      }

      return tx.reservation.create({
        data: {
          organizationId,
          articleId: dto.articleId,
          quantity: dto.quantity,
          startsOn: start,
          endsOn: end,
          customerId: dto.customerId,
          projectId: dto.projectId,
          status: dto.status ?? 'CONFIRMED',
          note: dto.note,
          createdById: actorUserId,
        },
        include,
      });
    });
  }

  async changeStatus(
    id: string,
    organizationId: string,
    status: ReservationStatus,
  ) {
    const reservation = await this.prisma.reservation.findFirst({
      where: { id, organizationId },
    });
    if (!reservation) throw new NotFoundException('Reservation not found');
    if (!(TRANSITIONS[reservation.status] ?? []).includes(status)) {
      throw new BadRequestException(
        `Status change ${reservation.status} -> ${status} is not allowed`,
      );
    }
    return this.prisma.reservation.update({
      where: { id },
      data: { status },
      include,
    });
  }
}
