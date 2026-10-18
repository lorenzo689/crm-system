import {
  Body,
  Controller,
  Delete,
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
import {
  ChangePurchaseOrderStatusDto,
  CreatePurchaseOrderDto,
  CreateSupplierDto,
  ReceiveGoodsDto,
  UpdateSupplierDto,
} from './purchasing.dto';
import { PurchasingService } from './purchasing.service';

@UseGuards(JwtAuthGuard)
@Controller()
export class PurchasingController {
  constructor(
    private readonly service: PurchasingService,
    private readonly usersService: UsersService,
  ) {}

  private async scope(req: Request) {
    const payload = req.user as JwtPayload;
    return {
      userId: payload.sub,
      organizationId: await this.usersService.getOrganizationId(payload.sub),
    };
  }

  @Get('suppliers')
  async listSuppliers(@Req() req: Request) {
    const { organizationId } = await this.scope(req);
    return this.service.listSuppliers(organizationId);
  }

  @Post('suppliers')
  async createSupplier(@Body() dto: CreateSupplierDto, @Req() req: Request) {
    const { organizationId } = await this.scope(req);
    return this.service.createSupplier(organizationId, dto);
  }

  @Patch('suppliers/:id')
  async updateSupplier(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSupplierDto,
    @Req() req: Request,
  ) {
    const { organizationId } = await this.scope(req);
    return this.service.updateSupplier(id, organizationId, dto);
  }

  @Post('suppliers/:id/archive')
  async archiveSupplier(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    const { organizationId } = await this.scope(req);
    return this.service.setSupplierArchived(id, organizationId, true);
  }

  @Post('suppliers/:id/unarchive')
  async unarchiveSupplier(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    const { organizationId } = await this.scope(req);
    return this.service.setSupplierArchived(id, organizationId, false);
  }

  @Get('purchase-orders')
  async listOrders(@Req() req: Request) {
    const { organizationId } = await this.scope(req);
    return this.service.listOrders(organizationId);
  }

  @Get('purchase-orders/:id')
  async findOrder(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    const { organizationId } = await this.scope(req);
    return this.service.findOrder(id, organizationId);
  }

  @Post('purchase-orders')
  async createOrder(@Body() dto: CreatePurchaseOrderDto, @Req() req: Request) {
    const { organizationId, userId } = await this.scope(req);
    return this.service.createOrder(organizationId, userId, dto);
  }

  @Post('purchase-orders/:id/status')
  async changeStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangePurchaseOrderStatusDto,
    @Req() req: Request,
  ) {
    const { organizationId } = await this.scope(req);
    return this.service.changeOrderStatus(id, organizationId, dto.status);
  }

  @Post('purchase-orders/:id/receive')
  async receive(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReceiveGoodsDto,
    @Req() req: Request,
  ) {
    const { organizationId } = await this.scope(req);
    return this.service.receiveGoods(id, organizationId, dto);
  }

  @Delete('purchase-orders/:id')
  async removeOrder(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    const { organizationId } = await this.scope(req);
    return this.service.removeOrder(id, organizationId);
  }
}
