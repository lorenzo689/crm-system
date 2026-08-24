import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth-guard';
import type { JwtPayload } from '../auth/strategies/jwt.strategies';
import { UsersService } from '../users/users.service';
import { ActivitiesService } from './activities.service';

@UseGuards(JwtAuthGuard)
@Controller('activities')
export class ActivitiesController {
  constructor(
    private readonly activitiesService: ActivitiesService,
    private readonly usersService: UsersService,
  ) {}

  @Get()
  async findByContext(
    @Req() req: Request,
    @Query('customerId') customerId?: string,
    @Query('projectId') projectId?: string,
    @Query('taskId') taskId?: string,
  ) {
    const payload = req.user as JwtPayload;
    const organizationId = await this.usersService.getOrganizationId(
      payload.sub,
    );
    return this.activitiesService.findByContext(organizationId, {
      customerId,
      projectId,
      taskId,
    });
  }
}
