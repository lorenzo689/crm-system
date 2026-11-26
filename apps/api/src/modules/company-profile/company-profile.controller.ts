import { Body, Controller, Get, Put, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth-guard';
import type { JwtPayload } from '../auth/strategies/jwt.strategies';
import { UsersService } from '../users/users.service';
import { UpdateCompanyProfileDto } from './company-profile.dto';

@UseGuards(JwtAuthGuard)
@Controller('company-profile')
export class CompanyProfileController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
  ) {}

  @Get()
  async get(@Req() req: Request) {
    const organizationId = await this.usersService.getOrganizationId(
      (req.user as JwtPayload).sub,
    );
    const profile = await this.prisma.companyProfile.findUnique({
      where: { organizationId },
    });
    if (profile) return profile;

    const organization = await this.prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: { name: true },
    });
    return {
      organizationId,
      legalName: organization.name,
      defaultPaymentTermDays: 14,
    };
  }

  @Put()
  async update(@Body() dto: UpdateCompanyProfileDto, @Req() req: Request) {
    const organizationId = await this.usersService.assertAdmin(
      (req.user as JwtPayload).sub,
    );
    return this.prisma.companyProfile.upsert({
      where: { organizationId },
      create: { ...dto, organizationId },
      update: dto,
    });
  }
}
