import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { ProjectWrite, ProjectWriteGuard } from '../access/project-write.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth-guard';
import type { JwtPayload } from '../auth/strategies/jwt.strategies';
import { UsersService } from '../users/users.service';
import {
  AvailabilityQueryDto,
  ChangeReservationStatusDto,
  CreateReservationDto,
  RentalService,
  ReservationQueryDto,
} from './rental.service';

@UseGuards(JwtAuthGuard, ProjectWriteGuard)
@Controller('reservations')
export class RentalController {
  constructor(
    private readonly service: RentalService,
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
  async list(@Query() query: ReservationQueryDto, @Req() req: Request) {
    const { organizationId } = await this.scope(req);
    return this.service.list(organizationId, query);
  }

  @Get('availability')
  async availability(
    @Query() query: AvailabilityQueryDto,
    @Req() req: Request,
  ) {
    const { organizationId } = await this.scope(req);
    return this.service.availability(
      organizationId,
      query.articleId,
      query.from,
      query.to,
    );
  }

  @ProjectWrite({ bodyField: 'projectId' })
  @Post()
  async create(@Body() dto: CreateReservationDto, @Req() req: Request) {
    const { organizationId, userId } = await this.scope(req);
    return this.service.create(organizationId, userId, dto);
  }

  @ProjectWrite({ entity: 'reservation' })
  @Post(':id/status')
  async changeStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeReservationStatusDto,
    @Req() req: Request,
  ) {
    const { organizationId } = await this.scope(req);
    return this.service.changeStatus(id, organizationId, dto.status);
  }
}
