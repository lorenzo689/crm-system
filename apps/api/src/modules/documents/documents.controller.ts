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
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import { pipeline } from 'stream/promises';
import { getAllowedOrigins } from '../../common/http/request-origin';
import { buildContentDisposition } from '../../common/storage/s3-storage.adapter';
import { JwtAuthGuard } from '../auth/guards/jwt-auth-guard';
import type { JwtPayload } from '../auth/strategies/jwt.strategies';
import { UsersService } from '../users/users.service';
import { CreateDocumentDto } from './dto/create-document.dto';
import { DownloadQueryDto } from './dto/download-url-query.dto';
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

  /**
   * Streams a document version through the API (authenticated, organisation
   * scoped). Object storage stays internal; no presigned URL leaves the
   * server. Only PDFs and raster images are ever shown inline.
   */
  @Get(':id/download')
  async download(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: DownloadQueryDto,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const payload = req.user as JwtPayload;
    const organizationId = await this.usersService.getOrganizationId(
      payload.sub,
    );
    const file = await this.documentsService.openDownload(id, organizationId, {
      versionId: query.version,
    });

    const inline =
      query.disposition === 'inline' && INLINE_MIME_TYPES.has(file.mimeType);
    res.status(200);
    // Type of the validated upload (allow-list at upload time), not S3 metadata.
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader(
      'Content-Disposition',
      buildContentDisposition(inline ? 'inline' : 'attachment', file.fileName),
    );
    if (file.contentLength !== undefined) {
      res.setHeader('Content-Length', String(file.contentLength));
    }
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // Previews are embedded by the web app (same origin in production, the
    // allowed web origin locally); nothing else may frame them.
    res.removeHeader('X-Frame-Options');
    res.setHeader(
      'Content-Security-Policy',
      `default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; frame-ancestors 'self' ${getAllowedOrigins().join(' ')}`,
    );
    res.setHeader('Cross-Origin-Resource-Policy', 'same-site');

    try {
      // Streams chunk by chunk with backpressure; memory stays bounded.
      await pipeline(file.body, res);
    } catch {
      // Client aborted or storage failed mid-stream: headers are sent, so
      // the only safe reaction is to drop the connection.
      file.body.destroy();
      res.destroy();
    }
  }
}

const INLINE_MIME_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
]);
