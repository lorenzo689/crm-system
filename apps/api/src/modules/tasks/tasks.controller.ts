import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import type {
  TaskPriority,
  TaskStatus,
} from '../../../generated/prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth-guard';
import type { JwtPayload } from '../auth/strategies/jwt.strategies';
import { UsersService } from '../users/users.service';
import { AssignTaskDto } from './dto/assign-task.dto';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { TasksService } from './tasks.service';

@UseGuards(JwtAuthGuard)
@Controller('tasks')
export class TasksController {
  constructor(
    private readonly tasksService: TasksService,
    private readonly usersService: UsersService,
  ) {}

  @Get()
  async findAll(
    @Req() req: Request,
    @Query('projectId') projectId?: string,
    @Query('assigneeId') assigneeId?: string,
    @Query('status') status?: TaskStatus,
    @Query('priority') priority?: TaskPriority,
    @Query('due') due?: 'overdue' | 'today' | 'upcoming',
    @Query('archived') archived?: string,
    @Query('search') search?: string,
  ) {
    const payload = req.user as JwtPayload;
    const organizationId = await this.usersService.getOrganizationId(
      payload.sub,
    );
    return this.tasksService.findAll(organizationId, {
      projectId,
      assigneeId,
      status,
      priority,
      due,
      archived: archived === undefined ? undefined : archived === 'true',
      search,
    });
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @Req() req: Request) {
    const payload = req.user as JwtPayload;
    const organizationId = await this.usersService.getOrganizationId(
      payload.sub,
    );
    return this.tasksService.findOne(id, organizationId);
  }

  @Post()
  async create(@Body() dto: CreateTaskDto, @Req() req: Request) {
    const payload = req.user as JwtPayload;
    const organizationId = await this.usersService.getOrganizationId(
      payload.sub,
    );
    return this.tasksService.create(organizationId, payload.sub, dto);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateTaskDto,
    @Req() req: Request,
  ) {
    const payload = req.user as JwtPayload;
    const organizationId = await this.usersService.getOrganizationId(
      payload.sub,
    );
    return this.tasksService.update(id, organizationId, dto);
  }

  @Post(':id/complete')
  async complete(@Param('id') id: string, @Req() req: Request) {
    const payload = req.user as JwtPayload;
    const organizationId = await this.usersService.getOrganizationId(
      payload.sub,
    );
    return this.tasksService.complete(id, organizationId);
  }

  @Post(':id/cancel')
  async cancel(@Param('id') id: string, @Req() req: Request) {
    const payload = req.user as JwtPayload;
    const organizationId = await this.usersService.getOrganizationId(
      payload.sub,
    );
    return this.tasksService.cancel(id, organizationId);
  }

  @Post(':id/archive')
  async archive(@Param('id') id: string, @Req() req: Request) {
    const payload = req.user as JwtPayload;
    const organizationId = await this.usersService.getOrganizationId(
      payload.sub,
    );
    return this.tasksService.archive(id, organizationId);
  }

  @Post(':id/unarchive')
  async unarchive(@Param('id') id: string, @Req() req: Request) {
    const payload = req.user as JwtPayload;
    const organizationId = await this.usersService.getOrganizationId(
      payload.sub,
    );
    return this.tasksService.unarchive(id, organizationId);
  }

  @Post(':id/assignments')
  async assignUser(
    @Param('id') taskId: string,
    @Body() dto: AssignTaskDto,
    @Req() req: Request,
  ) {
    const payload = req.user as JwtPayload;
    const organizationId = await this.usersService.getOrganizationId(
      payload.sub,
    );
    return this.tasksService.assignUser(
      taskId,
      organizationId,
      dto.userId,
      dto.role,
    );
  }

  @Delete(':id/assignments/:userId')
  async unassignUser(
    @Param('id') taskId: string,
    @Param('userId') userId: string,
    @Req() req: Request,
  ) {
    const payload = req.user as JwtPayload;
    const organizationId = await this.usersService.getOrganizationId(
      payload.sub,
    );
    await this.tasksService.unassignUser(taskId, organizationId, userId);
    return { success: true };
  }
}
