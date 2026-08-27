import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth-guard';
import type { JwtPayload } from '../auth/strategies/jwt.strategies';
import { UsersService } from '../users/users.service';
import { SearchQueryDto } from './dto/search-query.dto';
import { SearchService } from './search.service';

@UseGuards(JwtAuthGuard)
@Controller('search')
export class SearchController {
  constructor(
    private readonly searchService: SearchService,
    private readonly usersService: UsersService,
  ) {}

  @Get()
  async search(@Query() query: SearchQueryDto, @Req() req: Request) {
    const payload = req.user as JwtPayload;
    const organizationId = await this.usersService.getOrganizationId(
      payload.sub,
    );
    return this.searchService.search(organizationId, query.q);
  }
}
