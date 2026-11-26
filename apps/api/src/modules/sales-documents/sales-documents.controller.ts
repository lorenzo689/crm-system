import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { Roles } from '../auth/decorators/roles.decorator';
import { ProjectWrite, ProjectWriteGuard } from '../access/project-write.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth-guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { JwtPayload } from '../auth/strategies/jwt.strategies';
import { UsersService } from '../users/users.service';
import {
  ChangeStatusDto,
  CreateCreditNoteDto,
  CreatePaymentDto,
  CreateSalesDocumentDto,
  ListSalesDocumentsQueryDto,
  SendSalesDocumentDto,
  UpdateSalesDocumentDto,
} from './dto/sales-document.dto';
import { SalesDocumentsService } from './sales-documents.service';

@UseGuards(JwtAuthGuard, RolesGuard, ProjectWriteGuard)
@Controller('sales-documents')
export class SalesDocumentsController {
  constructor(
    private readonly service: SalesDocumentsService,
    private readonly usersService: UsersService,
  ) {}

  private async scope(req: Request) {
    const payload = req.user as JwtPayload;
    return {
      userId: payload.sub,
      organizationId: await this.usersService.getOrganizationId(payload.sub),
    };
  }

  @Get()
  async findAll(
    @Query() query: ListSalesDocumentsQueryDto,
    @Req() req: Request,
  ) {
    const { organizationId } = await this.scope(req);
    return this.service.findAll(organizationId, query);
  }

  // Revenue and open-amount key figures: owners and admins only.
  @Roles('OWNER', 'ADMIN')
  @Get('summary')
  async summary(@Req() req: Request) {
    const { organizationId } = await this.scope(req);
    return this.service.summary(organizationId);
  }

  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    const { organizationId } = await this.scope(req);
    return this.service.findOne(id, organizationId);
  }

  @ProjectWrite({ bodyField: 'projectId' })
  @Post()
  async create(@Body() dto: CreateSalesDocumentDto, @Req() req: Request) {
    const { organizationId, userId } = await this.scope(req);
    return this.service.create(organizationId, userId, dto);
  }

  @ProjectWrite({ entity: 'salesDocument', bodyField: 'projectId' })
  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSalesDocumentDto,
    @Req() req: Request,
  ) {
    const { organizationId } = await this.scope(req);
    return this.service.update(id, organizationId, dto);
  }

  @ProjectWrite({ entity: 'salesDocument' })
  @Post(':id/status')
  async changeStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeStatusDto,
    @Req() req: Request,
  ) {
    const { organizationId, userId } = await this.scope(req);
    return this.service.changeStatus(id, organizationId, userId, dto.status);
  }

  @ProjectWrite({ entity: 'salesDocument' })
  @Post(':id/convert-to-invoice')
  async convert(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    const { organizationId, userId } = await this.scope(req);
    return this.service.convertQuoteToInvoice(id, organizationId, userId);
  }

  @ProjectWrite({ entity: 'salesDocument' })
  @Post(':id/payments')
  async addPayment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreatePaymentDto,
    @Req() req: Request,
  ) {
    const { organizationId, userId } = await this.scope(req);
    return this.service.addPayment(id, organizationId, userId, dto);
  }

  @ProjectWrite({ entity: 'salesDocument' })
  @Post(':id/credit-note')
  async creditNote(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateCreditNoteDto,
    @Req() req: Request,
  ) {
    const { organizationId, userId } = await this.scope(req);
    return this.service.createCreditNote(id, organizationId, userId, dto);
  }

  @ProjectWrite({ entity: 'salesDocument' })
  @Post(':id/dunning')
  async dunning(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    const { organizationId, userId } = await this.scope(req);
    return this.service.escalateDunning(id, organizationId, userId);
  }

  @Get(':id/pdf')
  async pdf(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const { organizationId } = await this.scope(req);
    const { buffer, fileName } = await this.service.renderPdf(
      id,
      organizationId,
    );
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${fileName}"`,
      'Cache-Control': 'private, no-store',
    });
    res.send(buffer);
  }

  @Get(':id/xrechnung')
  async xrechnung(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const { organizationId } = await this.scope(req);
    const { xml, fileName } = await this.service.renderXRechnungXml(
      id,
      organizationId,
    );
    res.set({
      'Content-Type': 'application/xml; charset=utf-8',
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Cache-Control': 'private, no-store',
    });
    res.send(xml);
  }

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ProjectWrite({ entity: 'salesDocument' })
  @Post(':id/send')
  async send(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SendSalesDocumentDto,
    @Req() req: Request,
  ) {
    const { organizationId, userId } = await this.scope(req);
    return this.service.sendByEmail(id, organizationId, userId, dto);
  }

  @ProjectWrite({ entity: 'salesDocument' })
  @Delete(':id')
  async remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    const { organizationId } = await this.scope(req);
    return this.service.remove(id, organizationId);
  }
}
