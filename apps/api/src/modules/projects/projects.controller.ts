import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import type {
  ProjectPriority,
  ProjectStatus,
} from '../../../generated/prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth-guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { JwtPayload } from '../auth/strategies/jwt.strategies';
import { UsersService } from '../users/users.service';
import { AddProjectMemberDto } from './dto/add-project-member.dto';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectMemberDto } from './dto/update-project-member.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { ProjectsService } from './projects.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('projects')
export class ProjectsController {
  constructor(
    private readonly projectsService: ProjectsService,
    private readonly usersService: UsersService,
  ) {}

  @Get()
  async findAll(
    @Req() req: Request,
    @Query('customerId', new ParseUUIDPipe({ optional: true }))
    customerId?: string,
    @Query('status') status?: ProjectStatus,
    @Query('priority') priority?: ProjectPriority,
    @Query('archived') archived?: string,
    @Query('search') search?: string,
  ) {
    const payload = req.user as JwtPayload;
    const organizationId = await this.usersService.getOrganizationId(
      payload.sub,
    );
    return this.projectsService.findAll(organizationId, {
      customerId,
      status,
      priority,
      archived: archived === undefined ? undefined : archived === 'true',
      search,
    });
  }

  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    const payload = req.user as JwtPayload;
    const organizationId = await this.usersService.getOrganizationId(
      payload.sub,
    );
    return this.projectsService.findOne(id, organizationId);
  }

  @Post()
  async create(@Body() dto: CreateProjectDto, @Req() req: Request) {
    const payload = req.user as JwtPayload;
    const organizationId = await this.usersService.getOrganizationId(
      payload.sub,
    );
    return this.projectsService.create(organizationId, payload.sub, dto);
  }

  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProjectDto,
    @Req() req: Request,
  ) {
    const payload = req.user as JwtPayload;
    const organizationId = await this.usersService.getOrganizationId(
      payload.sub,
    );
    return this.projectsService.update(id, organizationId, payload.sub, dto);
  }

  @Get(':id/status-history')
  async getStatusHistory(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    const payload = req.user as JwtPayload;
    const organizationId = await this.usersService.getOrganizationId(
      payload.sub,
    );
    return this.projectsService.getStatusHistory(id, organizationId);
  }

  @Post(':id/archive')
  async archive(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    const payload = req.user as JwtPayload;
    const organizationId = await this.usersService.getOrganizationId(
      payload.sub,
    );
    return this.projectsService.archive(id, organizationId, payload.sub);
  }

  @Post(':id/unarchive')
  async unarchive(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    const payload = req.user as JwtPayload;
    const organizationId = await this.usersService.getOrganizationId(
      payload.sub,
    );
    return this.projectsService.unarchive(id, organizationId, payload.sub);
  }

  @Roles('OWNER', 'ADMIN')
  @Post(':id/members')
  async addMember(
    @Param('id', ParseUUIDPipe) projectId: string,
    @Body() dto: AddProjectMemberDto,
    @Req() req: Request,
  ) {
    return this.projectsService.addMember(
      req.user as JwtPayload,
      projectId,
      dto.userId,
      dto.role,
    );
  }

  @Roles('OWNER', 'ADMIN')
  @Patch(':id/members/:userId')
  async updateMember(
    @Param('id', ParseUUIDPipe) projectId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: UpdateProjectMemberDto,
    @Req() req: Request,
  ) {
    return this.projectsService.updateMemberRole(
      req.user as JwtPayload,
      projectId,
      userId,
      dto.role,
    );
  }

  @Roles('OWNER', 'ADMIN')
  @Delete(':id/members/:userId')
  async removeMember(
    @Param('id', ParseUUIDPipe) projectId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Req() req: Request,
  ) {
    await this.projectsService.removeMember(
      req.user as JwtPayload,
      projectId,
      userId,
    );
    return { success: true };
  }
}
