import { Controller, Get, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth-guard';
import type { JwtPayload } from '../auth/strategies/jwt.strategies';
import { UsersService } from '../users/users.service';
import { ReportRangeDto, ReportsService } from './reports.service';

@UseGuards(JwtAuthGuard)
@Controller('reports')
export class ReportsController {
  constructor(
    private readonly service: ReportsService,
    private readonly usersService: UsersService,
  ) {}

  private organizationId(req: Request) {
    return this.usersService.getOrganizationId((req.user as JwtPayload).sub);
  }

  private csv(res: Response, fileName: string, content: string) {
    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Cache-Control': 'private, no-store',
    });
    res.send(content);
  }

  @Get('projects')
  async projects(@Query() query: ReportRangeDto, @Req() req: Request) {
    return this.service.projectProfitability(
      await this.organizationId(req),
      query,
    );
  }

  @Get('customers')
  async customers(@Query() query: ReportRangeDto, @Req() req: Request) {
    return this.service.topCustomers(await this.organizationId(req), query);
  }

  @Get('export/sales')
  async exportSales(
    @Query() query: ReportRangeDto,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const csv = await this.service.salesLedgerCsv(
      await this.organizationId(req),
      query,
    );
    this.csv(res, 'rechnungsausgang.csv', csv);
  }

  @Get('export/purchases')
  async exportPurchases(
    @Query() query: ReportRangeDto,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const csv = await this.service.purchaseLedgerCsv(
      await this.organizationId(req),
      query,
    );
    this.csv(res, 'rechnungseingang.csv', csv);
  }
}
