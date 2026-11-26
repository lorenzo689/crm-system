import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth-guard';
import type { JwtPayload } from '../auth/strategies/jwt.strategies';
import { UsersService } from '../users/users.service';
import { ArticlesService } from './articles.service';
import { CreateArticleDto } from './dto/create-article.dto';
import { UpdateArticleDto } from './dto/update-article.dto';

@UseGuards(JwtAuthGuard)
@Controller('articles')
export class ArticlesController {
  constructor(
    private readonly articlesService: ArticlesService,
    private readonly usersService: UsersService,
  ) {}

  private organizationId(req: Request) {
    return this.usersService.getOrganizationId((req.user as JwtPayload).sub);
  }

  @Get()
  async findAll(@Req() req: Request) {
    return this.articlesService.findAll(await this.organizationId(req));
  }

  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    return this.articlesService.findOne(id, await this.organizationId(req));
  }

  @Post()
  async create(@Body() dto: CreateArticleDto, @Req() req: Request) {
    return this.articlesService.create(await this.organizationId(req), dto);
  }

  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateArticleDto,
    @Req() req: Request,
  ) {
    return this.articlesService.update(id, await this.organizationId(req), dto);
  }

  @Post(':id/archive')
  async archive(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    return this.articlesService.setArchived(
      id,
      await this.organizationId(req),
      true,
    );
  }

  @Post(':id/unarchive')
  async unarchive(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    return this.articlesService.setArchived(
      id,
      await this.organizationId(req),
      false,
    );
  }
}
