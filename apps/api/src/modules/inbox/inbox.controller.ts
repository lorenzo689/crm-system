import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsEnum, IsOptional } from 'class-validator';
import type { Request } from 'express';
import { InboundEmailStatus } from '../../../generated/prisma/enums';
import { JwtAuthGuard } from '../auth/guards/jwt-auth-guard';
import type { JwtPayload } from '../auth/strategies/jwt.strategies';
import { UsersService } from '../users/users.service';
import { InboxService } from './inbox.service';

class ListInboxQuery {
  @IsOptional()
  @IsEnum(InboundEmailStatus)
  status?: InboundEmailStatus;
}

class UpdateInboxStatusDto {
  @IsEnum(InboundEmailStatus)
  status!: InboundEmailStatus;
}

@UseGuards(JwtAuthGuard)
@Controller('inbox')
export class InboxController {
  constructor(
    private readonly inbox: InboxService,
    private readonly usersService: UsersService,
  ) {}

  private organizationId(req: Request) {
    return this.usersService.getOrganizationId((req.user as JwtPayload).sub);
  }

  @Get()
  async list(@Query() query: ListInboxQuery, @Req() req: Request) {
    return {
      configured: this.inbox.isConfigured(),
      emails: await this.inbox.list(
        await this.organizationId(req),
        query.status,
      ),
    };
  }

  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateInboxStatusDto,
    @Req() req: Request,
  ) {
    return this.inbox.setStatus(id, await this.organizationId(req), dto.status);
  }

  @Throttle({ default: { limit: 6, ttl: 60000 } })
  @Post('poll')
  async poll(@Req() req: Request) {
    // Polling imports into the configured inbox organization; the caller must belong to one.
    await this.organizationId(req);
    return this.inbox.poll();
  }
}
