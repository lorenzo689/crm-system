import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth-guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthUser } from '../auth/strategies/jwt.strategies';
import { ChangeRoleDto } from './dto/change-role.dto';
import { UsersAdminService } from './users-admin.service';
import { UsersService } from './users.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly usersAdminService: UsersAdminService,
  ) {}

  @Get('me')
  async getMe(@Req() req: Request) {
    const user = req.user as AuthUser;
    return this.usersService.findById(user.sub);
  }

  @Get()
  async findAll(@Req() req: Request) {
    const user = req.user as AuthUser;
    return this.usersService.findAllInOrganization(user.organizationId);
  }

  @Roles('OWNER', 'ADMIN')
  @Patch(':id/role')
  async changeRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeRoleDto,
    @Req() req: Request,
  ) {
    return this.usersAdminService.changeRole(
      req.user as AuthUser,
      id,
      dto.role,
    );
  }

  @Roles('OWNER', 'ADMIN')
  @HttpCode(200)
  @Post(':id/deactivate')
  async deactivate(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    return this.usersAdminService.deactivate(req.user as AuthUser, id);
  }

  @Roles('OWNER', 'ADMIN')
  @HttpCode(200)
  @Post(':id/revoke-sessions')
  async revokeSessions(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    return this.usersAdminService.revokeSessions(req.user as AuthUser, id);
  }
}
