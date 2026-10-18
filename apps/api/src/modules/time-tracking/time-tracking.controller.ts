import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth-guard';
import type { JwtPayload } from '../auth/strategies/jwt.strategies';
import { UsersService } from '../users/users.service';
import {
  CreateTimeEntryDto,
  InvoiceTimeEntriesDto,
  TimeEntryQueryDto,
  TimeTrackingService,
} from './time-tracking.service';

@UseGuards(JwtAuthGuard)
@Controller('time-entries')
export class TimeTrackingController {
  constructor(
    private readonly service: TimeTrackingService,
    private readonly usersService: UsersService,
  ) {}

  private async scope(req: Request) {
    const payload = req.user as JwtPayload;
    return {
      userId: payload.sub,
      organizationId: await this.usersService.getOrganizationId(payload.sub),
    };
  }

  @Get()
  async list(@Query() query: TimeEntryQueryDto, @Req() req: Request) {
    const { organizationId } = await this.scope(req);
    return this.service.list(organizationId, query);
  }

  @Get('summary')
  async summary(@Query() query: TimeEntryQueryDto, @Req() req: Request) {
    const { organizationId } = await this.scope(req);
    return this.service.summary(organizationId, query);
  }

  @Post()
  async create(@Body() dto: CreateTimeEntryDto, @Req() req: Request) {
    const { organizationId, userId } = await this.scope(req);
    return this.service.create(organizationId, userId, dto);
  }

  @Post('invoice')
  async invoice(@Body() dto: InvoiceTimeEntriesDto, @Req() req: Request) {
    const { organizationId, userId } = await this.scope(req);
    return this.service.invoiceEntries(organizationId, userId, dto);
  }

  @Delete(':id')
  async remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    const { organizationId, userId } = await this.scope(req);
    return this.service.remove(id, organizationId, userId);
  }
}
