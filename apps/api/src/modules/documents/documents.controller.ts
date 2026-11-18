import {
  Body,
  Controller,
  Get,
  MaxFileSizeValidator,
  Param,
  ParseFilePipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth-guard';
import type { JwtPayload } from '../auth/strategies/jwt.strategies';
import { UsersService } from '../users/users.service';
import { CreateDocumentDto } from './dto/create-document.dto';
import { DownloadUrlQueryDto } from './dto/download-url-query.dto';
import { ListDocumentsQueryDto } from './dto/list-documents-query.dto';
import { UpdateDocumentDto } from './dto/update-document.dto';
import { DocumentsService } from './documents.service';

@UseGuards(JwtAuthGuard)
@Controller('documents')
export class DocumentsController {
  constructor(
    private readonly documentsService: DocumentsService,
    private readonly usersService: UsersService,
  ) {}

  @Get()
  async findAll(@Req() req: Request, @Query() query: ListDocumentsQueryDto) {
    const payload = req.user as JwtPayload;
    const organizationId = await this.usersService.getOrganizationId(
      payload.sub,
    );
    return this.documentsService.findAll(organizationId, {
      ...query,
      archived:
        query.archived === undefined ? undefined : query.archived === 'true',
    });
  }

  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    const payload = req.user as JwtPayload;
    const organizationId = await this.usersService.getOrganizationId(
      payload.sub,
    );
    return this.documentsService.findOne(id, organizationId);
  }

  @Post()
  async create(@Body() dto: CreateDocumentDto, @Req() req: Request) {
    const payload = req.user as JwtPayload;
    const organizationId = await this.usersService.getOrganizationId(
      payload.sub,
    );
    return this.documentsService.create(organizationId, payload.sub, dto);
  }

  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDocumentDto,
    @Req() req: Request,
  ) {
    const payload = req.user as JwtPayload;
    const organizationId = await this.usersService.getOrganizationId(
      payload.sub,
    );
    return this.documentsService.update(id, organizationId, payload.sub, dto);
  }

  @Post(':id/archive')
  async archive(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    const payload = req.user as JwtPayload;
    const organizationId = await this.usersService.getOrganizationId(
      payload.sub,
    );
    return this.documentsService.archive(id, organizationId, payload.sub);
  }

  @Post(':id/versions')
  @UseInterceptors(FileInterceptor('file'))
  async uploadVersion(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile(
      new ParseFilePipe({
        validators: [new MaxFileSizeValidator({ maxSize: 50 * 1024 * 1024 })],
      }),
    )
    file: Express.Multer.File,
    @Req() req: Request,
  ) {
    const payload = req.user as JwtPayload;
    const organizationId = await this.usersService.getOrganizationId(
      payload.sub,
    );
    return this.documentsService.uploadVersion(
      id,
      organizationId,
      payload.sub,
      file,
    );
  }

  @Get(':id/download-url')
  async getDownloadUrl(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: DownloadUrlQueryDto,
    @Req() req: Request,
  ) {
    const payload = req.user as JwtPayload;
    const organizationId = await this.usersService.getOrganizationId(
      payload.sub,
    );
    const url = await this.documentsService.getDownloadUrl(id, organizationId, {
      disposition: query.disposition,
      versionId: query.version,
    });
    return { url };
  }
}
