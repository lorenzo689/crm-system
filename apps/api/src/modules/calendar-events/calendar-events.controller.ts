import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import type { CalendarEventStatus } from '../../../generated/prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth-guard';
import type { JwtPayload } from '../auth/strategies/jwt.strategies';
import { UsersService } from '../users/users.service';
import { CalendarEventsService } from './calendar-events.service';
import { CreateCalendarEventDto } from './dto/create-calendar-event.dto';
import { CreateReminderDto } from './dto/create-reminder.dto';
import { UpdateCalendarEventDto } from './dto/update-calendar-event.dto';

@UseGuards(JwtAuthGuard)
@Controller('calendar-events')
export class CalendarEventsController {
  constructor(
    private readonly calendarEventsService: CalendarEventsService,
    private readonly usersService: UsersService,
  ) {}

  @Get()
  async findAll(
    @Req() req: Request,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('customerId') customerId?: string,
    @Query('projectId') projectId?: string,
    @Query('status') status?: CalendarEventStatus,
  ) {
    const payload = req.user as JwtPayload;
    const organizationId = await this.usersService.getOrganizationId(
      payload.sub,
    );
    return this.calendarEventsService.findAll(organizationId, {
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      customerId,
      projectId,
      status,
    });
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @Req() req: Request) {
    const payload = req.user as JwtPayload;
    const organizationId = await this.usersService.getOrganizationId(
      payload.sub,
    );
    return this.calendarEventsService.findOne(id, organizationId);
  }

  @Post()
  async create(@Body() dto: CreateCalendarEventDto, @Req() req: Request) {
    const payload = req.user as JwtPayload;
    const organizationId = await this.usersService.getOrganizationId(
      payload.sub,
    );
    return this.calendarEventsService.create(organizationId, payload.sub, dto);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateCalendarEventDto,
    @Req() req: Request,
  ) {
    const payload = req.user as JwtPayload;
    const organizationId = await this.usersService.getOrganizationId(
      payload.sub,
    );
    return this.calendarEventsService.update(
      id,
      organizationId,
      payload.sub,
      dto,
    );
  }

  @Post(':id/cancel')
  async cancel(@Param('id') id: string, @Req() req: Request) {
    const payload = req.user as JwtPayload;
    const organizationId = await this.usersService.getOrganizationId(
      payload.sub,
    );
    return this.calendarEventsService.cancel(id, organizationId, payload.sub);
  }

  @Post(':id/archive')
  async archive(@Param('id') id: string, @Req() req: Request) {
    const payload = req.user as JwtPayload;
    const organizationId = await this.usersService.getOrganizationId(
      payload.sub,
    );
    return this.calendarEventsService.archive(id, organizationId);
  }

  @Post(':id/reminders')
  async addReminder(
    @Param('id') id: string,
    @Body() dto: CreateReminderDto,
    @Req() req: Request,
  ) {
    const payload = req.user as JwtPayload;
    const organizationId = await this.usersService.getOrganizationId(
      payload.sub,
    );
    return this.calendarEventsService.addReminder(
      id,
      organizationId,
      payload.sub,
      dto.remindAt,
    );
  }

  @Get(':id/reminders')
  async findReminders(@Param('id') id: string, @Req() req: Request) {
    const payload = req.user as JwtPayload;
    const organizationId = await this.usersService.getOrganizationId(
      payload.sub,
    );
    return this.calendarEventsService.findReminders(
      id,
      organizationId,
      payload.sub,
    );
  }

  @Post('reminders/:reminderId/cancel')
  async cancelReminder(
    @Param('reminderId') reminderId: string,
    @Req() req: Request,
  ) {
    const payload = req.user as JwtPayload;
    return this.calendarEventsService.cancelReminder(reminderId, payload.sub);
  }
}
