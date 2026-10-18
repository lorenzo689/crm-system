import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateArticleDto } from './dto/create-article.dto';
import { UpdateArticleDto } from './dto/update-article.dto';

@Injectable()
export class ArticlesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(organizationId: string) {
    return this.prisma.article.findMany({
      where: { organizationId },
      orderBy: { articleNumber: 'asc' },
    });
  }

  async findOne(id: string, organizationId: string) {
    const article = await this.prisma.article.findFirst({
      where: { id, organizationId },
    });
    if (!article) throw new NotFoundException('Article not found');
    return article;
  }

  async create(organizationId: string, dto: CreateArticleDto) {
    try {
      return await this.prisma.article.create({
        data: { ...dto, organizationId },
      });
    } catch (error) {
      this.rethrowUnique(error);
    }
  }

  async update(id: string, organizationId: string, dto: UpdateArticleDto) {
    await this.findOne(id, organizationId);
    try {
      return await this.prisma.article.update({ where: { id }, data: dto });
    } catch (error) {
      this.rethrowUnique(error);
    }
  }

  async setArchived(id: string, organizationId: string, archived: boolean) {
    await this.findOne(id, organizationId);
    return this.prisma.article.update({
      where: { id },
      data: { archivedAt: archived ? new Date() : null },
    });
  }

  private rethrowUnique(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException('Article number already exists');
    }
    throw error;
  }
}
