import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Prisma } from '../../../generated/prisma/client';
import { BackgroundJobsService } from '../../common/jobs/background-jobs.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SalesDocumentItemDto } from '../sales-documents/dto/sales-document.dto';
import { SalesDocumentsService } from '../sales-documents/sales-documents.service';
import { nextRunAfter } from './recurrence';

export class CreateRecurringInvoiceDto {
  @IsString()
  @MaxLength(200)
  title!: string;

  @IsUUID()
  customerId!: string;

  @IsOptional()
  @IsUUID()
  projectId?: string;

  @IsInt()
  @Min(1)
  @Max(12)
  intervalMonths!: number;

  /** First run date; later runs follow every `intervalMonths`. */
  @IsDateString()
  startDate!: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  headerText?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  footerText?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => SalesDocumentItemDto)
  items!: SalesDocumentItemDto[];
}

const include = {
  customer: { select: { id: true, name: true } },
  project: { select: { id: true, name: true } },
};

@Injectable()
export class RecurringInvoicesService {
  private readonly logger = new Logger(RecurringInvoicesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly salesDocuments: SalesDocumentsService,
    private readonly jobs?: BackgroundJobsService,
  ) {}

  list(organizationId: string) {
    return this.prisma.recurringInvoice.findMany({
      where: { organizationId },
      include,
      orderBy: [{ active: 'desc' }, { nextRunDate: 'asc' }],
    });
  }

  async create(organizationId: string, dto: CreateRecurringInvoiceDto) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: dto.customerId, organizationId },
      select: { id: true },
    });
    if (!customer) throw new BadRequestException('Customer not found');
    if (dto.projectId) {
      const project = await this.prisma.project.findFirst({
        where: {
          id: dto.projectId,
          organizationId,
          customerId: dto.customerId,
        },
        select: { id: true },
      });
      if (!project) {
        throw new BadRequestException(
          'Project not found or belongs to another customer',
        );
      }
    }
    return this.prisma.recurringInvoice.create({
      data: {
        organizationId,
        customerId: dto.customerId,
        projectId: dto.projectId,
        title: dto.title,
        intervalMonths: dto.intervalMonths,
        nextRunDate: new Date(dto.startDate),
        headerText: dto.headerText,
        footerText: dto.footerText,
        items: dto.items as unknown as Prisma.InputJsonValue,
      },
      include,
    });
  }

  async setActive(id: string, organizationId: string, active: boolean) {
    const result = await this.prisma.recurringInvoice.updateMany({
      where: { id, organizationId },
      data: { active },
    });
    if (result.count === 0)
      throw new NotFoundException('Recurring invoice not found');
    return this.prisma.recurringInvoice.findUniqueOrThrow({
      where: { id },
      include,
    });
  }

  async remove(id: string, organizationId: string) {
    const result = await this.prisma.recurringInvoice.deleteMany({
      where: { id, organizationId },
    });
    if (result.count === 0)
      throw new NotFoundException('Recurring invoice not found');
    return { deleted: true };
  }

  @Cron('0 5 * * *', { name: 'recurring-invoices' })
  async runScheduledJob() {
    await this.jobs?.run('recurring-invoices', () => this.runScheduled());
  }

  async runScheduled() {
    const organizations = await this.prisma.recurringInvoice.findMany({
      where: { active: true, nextRunDate: { lte: new Date() } },
      distinct: ['organizationId'],
      select: { organizationId: true },
    });
    for (const { organizationId } of organizations) {
      try {
        const created = await this.runDue(organizationId);
        this.logger.log(
          `Recurring invoices for ${organizationId}: ${created} draft(s)`,
        );
      } catch (error) {
        this.logger.error(
          `Recurring run failed for ${organizationId}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  /** Creates invoice drafts (never issued ones) for every due template. */
  async runDue(organizationId: string) {
    // Drafts are created in the name of an owner/admin; organizations that
    // have none yet (e.g. seeded without roles) fall back to the oldest member.
    const owner =
      (await this.prisma.organizationMember.findFirst({
        where: { organizationId, role: { in: ['OWNER', 'ADMIN'] } },
        orderBy: { joinedAt: 'asc' },
        select: { userId: true },
      })) ??
      (await this.prisma.organizationMember.findFirst({
        where: { organizationId },
        orderBy: { joinedAt: 'asc' },
        select: { userId: true },
      }));
    if (!owner) return 0;

    const now = new Date();
    const today = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const due = await this.prisma.recurringInvoice.findMany({
      where: { organizationId, active: true, nextRunDate: { lte: today } },
    });

    let created = 0;
    for (const template of due) {
      // Advance first with a guard on the old date, so two overlapping runs
      // cannot both create the same invoice.
      const claimed = await this.prisma.recurringInvoice.updateMany({
        where: { id: template.id, nextRunDate: template.nextRunDate },
        data: {
          nextRunDate: nextRunAfter(
            template.nextRunDate,
            template.intervalMonths,
            today,
          ),
          lastRunAt: now,
        },
      });
      if (claimed.count === 0) continue;

      try {
        await this.salesDocuments.create(organizationId, owner.userId, {
          type: 'INVOICE',
          customerId: template.customerId,
          projectId: template.projectId ?? undefined,
          issueDate: today.toISOString().slice(0, 10),
          headerText: template.headerText ?? undefined,
          footerText: template.footerText ?? undefined,
          items: template.items as unknown as SalesDocumentItemDto[],
        });
        created++;
      } catch (error) {
        // Roll the schedule back so the template is retried tomorrow.
        await this.prisma.recurringInvoice.update({
          where: { id: template.id },
          data: { nextRunDate: template.nextRunDate },
        });
        this.logger.warn(
          `Template ${template.id} failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    return created;
  }
}
