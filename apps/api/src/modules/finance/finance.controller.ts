import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsEnum, IsOptional } from 'class-validator';
import type { Request } from 'express';
import { SupplierInvoiceStatus } from '../../../generated/prisma/enums';
import { JwtAuthGuard } from '../auth/guards/jwt-auth-guard';
import type { JwtPayload } from '../auth/strategies/jwt.strategies';
import { UsersService } from '../users/users.service';
import {
  CreateSupplierInvoiceDto,
  FinanceService,
  ImportBankCsvDto,
  ListTransactionsQueryDto,
  MatchTransactionDto,
  SupplierInvoiceStatusDto,
} from './finance.service';

class ListSupplierInvoicesQuery {
  @IsOptional()
  @IsEnum(SupplierInvoiceStatus)
  status?: SupplierInvoiceStatus;
}

@UseGuards(JwtAuthGuard)
@Controller('finance')
export class FinanceController {
  constructor(
    private readonly service: FinanceService,
    private readonly usersService: UsersService,
  ) {}

  private async scope(req: Request) {
    const payload = req.user as JwtPayload;
    return {
      userId: payload.sub,
      organizationId: await this.usersService.getOrganizationId(payload.sub),
    };
  }

  @Get('supplier-invoices')
  async listSupplierInvoices(
    @Query() query: ListSupplierInvoicesQuery,
    @Req() req: Request,
  ) {
    const { organizationId } = await this.scope(req);
    return this.service.listSupplierInvoices(organizationId, query.status);
  }

  @Post('supplier-invoices')
  async createSupplierInvoice(
    @Body() dto: CreateSupplierInvoiceDto,
    @Req() req: Request,
  ) {
    const { organizationId } = await this.scope(req);
    return this.service.createSupplierInvoice(organizationId, dto);
  }

  @Post('supplier-invoices/:id/status')
  async setSupplierInvoiceStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SupplierInvoiceStatusDto,
    @Req() req: Request,
  ) {
    const { organizationId } = await this.scope(req);
    return this.service.setSupplierInvoiceStatus(id, organizationId, dto);
  }

  @Get('payables')
  async payables(@Req() req: Request) {
    const { organizationId } = await this.scope(req);
    return this.service.payablesSummary(organizationId);
  }

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('bank/import')
  async importCsv(@Body() dto: ImportBankCsvDto, @Req() req: Request) {
    const { organizationId } = await this.scope(req);
    return this.service.importCsv(organizationId, dto.csv);
  }

  @Get('bank/transactions')
  async transactions(
    @Query() query: ListTransactionsQueryDto,
    @Req() req: Request,
  ) {
    const { organizationId } = await this.scope(req);
    return this.service.listTransactions(organizationId, query.status);
  }

  @Post('bank/transactions/:id/match')
  async match(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MatchTransactionDto,
    @Req() req: Request,
  ) {
    const { organizationId, userId } = await this.scope(req);
    return this.service.matchTransaction(id, organizationId, userId, dto);
  }

  @Post('bank/transactions/:id/ignore')
  async ignore(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    const { organizationId } = await this.scope(req);
    return this.service.ignoreTransaction(id, organizationId);
  }

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('bank/auto-match')
  async autoMatch(@Req() req: Request) {
    const { organizationId, userId } = await this.scope(req);
    return this.service.autoMatch(organizationId, userId);
  }
}
