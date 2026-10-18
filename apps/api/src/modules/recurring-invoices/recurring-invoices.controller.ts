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
import { JwtAuthGuard } from '../auth/guards/jwt-auth-guard';
import type { JwtPayload } from '../auth/strategies/jwt.strategies';
import { UsersService } from '../users/users.service';
import {
  CreateRecurringInvoiceDto,
  RecurringInvoicesService,
} from './recurring-invoices.service';

@UseGuards(JwtAuthGuard)
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

  @Post(':id/pause')
  async pause(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    return this.service.setActive(id, await this.organizationId(req), false);
  }

  @Post(':id/resume')
  async resume(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    return this.service.setActive(id, await this.organizationId(req), true);
  }

  @Delete(':id')
  async remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    return this.service.remove(id, await this.organizationId(req));
  }
}
