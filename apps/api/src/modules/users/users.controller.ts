import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth-guard';
import type { JwtPayload } from '../auth/strategies/jwt.strategies';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async getMe(@Req() req: Request) {
    const payload = req.user as JwtPayload;
    return this.usersService.findById(payload.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  async findAll(@Req() req: Request) {
    const payload = req.user as JwtPayload;
    const organizationId = await this.usersService.getOrganizationId(
      payload.sub,
    );
    return this.usersService.findAllInOrganization(organizationId);
  }
}
