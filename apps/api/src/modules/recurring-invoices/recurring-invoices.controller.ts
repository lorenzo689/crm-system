import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { Roles } from '../auth/decorators/roles.decorator';
import { ProjectWrite, ProjectWriteGuard } from '../access/project-write.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth-guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { JwtPayload } from '../auth/strategies/jwt.strategies';
import { UsersService } from '../users/users.service';
import {
  CreateRecurringInvoiceDto,
  RecurringInvoicesService,
} from './recurring-invoices.service';

// Finance-sensitive: owners and admins only until the business decides otherwise.
@UseGuards(JwtAuthGuard, RolesGuard, ProjectWriteGuard)
@Roles('OWNER', 'ADMIN')
@Controller('recurring-invoices')
export class RecurringInvoicesController {
  constructor(
    private readonly service: RecurringInvoicesService,
    private readonly usersService: UsersService,
  ) {}

  private organizationId(req: Request) {
    return this.usersService.getOrganizationId((req.user as JwtPayload).sub);
  }

  @Get()
  async list(@Req() req: Request) {
    return this.service.list(await this.organizationId(req));
  }

  @ProjectWrite({ bodyField: 'projectId' })
  @Post()
  async create(@Body() dto: CreateRecurringInvoiceDto, @Req() req: Request) {
    return this.service.create(await this.organizationId(req), dto);
  }

  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('run')
  async run(@Req() req: Request) {
    return {
      created: await this.service.runDue(await this.organizationId(req)),
    };
  }

  @ProjectWrite({ entity: 'recurringInvoice' })
  @Post(':id/pause')
  async pause(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    return this.service.setActive(id, await this.organizationId(req), false);
  }

  @ProjectWrite({ entity: 'recurringInvoice' })
  @Post(':id/resume')
  async resume(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    return this.service.setActive(id, await this.organizationId(req), true);
  }

  @ProjectWrite({ entity: 'recurringInvoice' })
  @Delete(':id')
  async remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    return this.service.remove(id, await this.organizationId(req));
  }
}
