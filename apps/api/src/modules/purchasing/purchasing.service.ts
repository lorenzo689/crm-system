import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, PurchaseOrderStatus } from '../../../generated/prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  CreatePurchaseOrderDto,
  CreateSupplierDto,
  ReceiveGoodsDto,
  UpdateSupplierDto,
} from './purchasing.dto';

const ALLOWED_TRANSITIONS: Partial<
  Record<PurchaseOrderStatus, PurchaseOrderStatus[]>
> = {
  DRAFT: ['ORDERED', 'CANCELLED'],
  ORDERED: ['CANCELLED'],
};

const detailInclude = {
  supplier: { select: { id: true, name: true, supplierNumber: true } },
  items: { orderBy: { position: 'asc' } },
} satisfies Prisma.PurchaseOrderInclude;

@Injectable()
export class PurchasingService {
  constructor(private readonly prisma: PrismaService) {}

  // ---- Suppliers ----

  listSuppliers(organizationId: string) {
    return this.prisma.supplier.findMany({
      where: { organizationId },
      orderBy: { name: 'asc' },
    });
  }

  async createSupplier(organizationId: string, dto: CreateSupplierDto) {
    try {
      return await this.prisma.supplier.create({
        data: { ...dto, organizationId },
      });
    } catch (error) {
      this.rethrowUnique(error, 'Supplier number already exists');
    }
  }

  async updateSupplier(
    id: string,
    organizationId: string,
    dto: UpdateSupplierDto,
  ) {
    await this.findSupplier(id, organizationId);
    try {
      return await this.prisma.supplier.update({ where: { id }, data: dto });
    } catch (error) {
      this.rethrowUnique(error, 'Supplier number already exists');
    }
  }

  async setSupplierArchived(
    id: string,
    organizationId: string,
    archived: boolean,
  ) {
    await this.findSupplier(id, organizationId);
    return this.prisma.supplier.update({
      where: { id },
      data: { archivedAt: archived ? new Date() : null },
    });
  }

  private async findSupplier(id: string, organizationId: string) {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id, organizationId },
    });
    if (!supplier) throw new NotFoundException('Supplier not found');
    return supplier;
  }

  // ---- Purchase orders ----

  listOrders(organizationId: string) {
    return this.prisma.purchaseOrder.findMany({
      where: { organizationId },
      include: { supplier: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
  }

  async findOrder(id: string, organizationId: string) {
    const order = await this.prisma.purchaseOrder.findFirst({
      where: { id, organizationId },
      include: detailInclude,
    });
    if (!order) throw new NotFoundException('Purchase order not found');
    return order;
  }

  async createOrder(
    organizationId: string,
    actorUserId: string,
    dto: CreatePurchaseOrderDto,
  ) {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id: dto.supplierId, organizationId, archivedAt: null },
      select: { id: true },
    });
    if (!supplier) throw new BadRequestException('Supplier not found');
    if (dto.projectId) {
      const project = await this.prisma.project.findFirst({
        where: { id: dto.projectId, organizationId },
        select: { id: true },
      });
      if (!project) throw new BadRequestException('Project not found');
    }

    const articleIds = [
      ...new Set(dto.items.map((item) => item.articleId).filter(Boolean)),
    ] as string[];
    if (articleIds.length > 0) {
      const count = await this.prisma.article.count({
        where: { id: { in: articleIds }, organizationId },
      });
      if (count !== articleIds.length) {
        throw new BadRequestException('Article not found');
      }
    }

    const netCents = dto.items.reduce(
      (sum, item) => sum + item.quantity * item.unitPriceCents,
      0,
    );

    return this.prisma.purchaseOrder.create({
      data: {
        organizationId,
        supplierId: dto.supplierId,
        projectId: dto.projectId,
        number: `ENTWURF-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
        orderDate: new Date(dto.orderDate),
        expectedDate: dto.expectedDate ? new Date(dto.expectedDate) : null,
        notes: dto.notes,
        netCents,
        createdById: actorUserId,
        items: {
          create: dto.items.map((item, index) => ({
            position: index + 1,
            articleId: item.articleId,
            description: item.description,
            quantity: item.quantity,
            unit: item.unit,
            unitPriceCents: item.unitPriceCents,
          })),
        },
      },
      include: detailInclude,
    });
  }

  async changeOrderStatus(
    id: string,
    organizationId: string,
    status: PurchaseOrderStatus,
  ) {
    const order = await this.findOrder(id, organizationId);
    if (!(ALLOWED_TRANSITIONS[order.status] ?? []).includes(status)) {
      throw new BadRequestException(
        `Status change ${order.status} -> ${status} is not allowed`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const data: Prisma.PurchaseOrderUpdateInput = { status };
      if (order.status === 'DRAFT' && status === 'ORDERED') {
        const year = order.orderDate.getUTCFullYear();
        const sequence = await tx.numberSequence.upsert({
          where: {
            organizationId_key: { organizationId, key: `PO-${year}` },
          },
          create: { organizationId, key: `PO-${year}`, lastValue: 1 },
          update: { lastValue: { increment: 1 } },
        });
        data.number = `BE-${year}-${String(sequence.lastValue).padStart(4, '0')}`;
      }
      return tx.purchaseOrder.update({
        where: { id },
        data,
        include: detailInclude,
      });
    });
  }

  async receiveGoods(id: string, organizationId: string, dto: ReceiveGoodsDto) {
    const order = await this.findOrder(id, organizationId);
    if (order.status !== 'ORDERED' && order.status !== 'PARTIALLY_RECEIVED') {
      throw new BadRequestException('Order is not open for goods receipt');
    }

    const itemsById = new Map(order.items.map((item) => [item.id, item]));
    const seen = new Set<string>();
    for (const line of dto.items) {
      const item = itemsById.get(line.itemId);
      if (!item) throw new BadRequestException('Order item not found');
      if (seen.has(line.itemId)) {
        throw new BadRequestException('Order item listed twice');
      }
      seen.add(line.itemId);
      if (item.receivedQuantity + line.quantity > item.quantity) {
        throw new ConflictException(
          `Position ${item.position}: more than ordered would be received`,
        );
      }
    }

    return this.prisma.$transaction(async (tx) => {
      for (const line of dto.items) {
        const item = itemsById.get(line.itemId)!;
        await tx.purchaseOrderItem.update({
          where: { id: item.id },
          data: { receivedQuantity: { increment: line.quantity } },
        });
        if (item.articleId) {
          await tx.article.updateMany({
            where: { id: item.articleId, trackStock: true },
            data: { stockQuantity: { increment: line.quantity } },
          });
        }
      }

      const items = await tx.purchaseOrderItem.findMany({
        where: { purchaseOrderId: id },
      });
      const allReceived = items.every(
        (item) => item.receivedQuantity >= item.quantity,
      );
      return tx.purchaseOrder.update({
        where: { id },
        data: { status: allReceived ? 'RECEIVED' : 'PARTIALLY_RECEIVED' },
        include: detailInclude,
      });
    });
  }

  async removeOrder(id: string, organizationId: string) {
    const order = await this.findOrder(id, organizationId);
    if (order.status !== 'DRAFT') {
      throw new BadRequestException('Only drafts can be deleted');
    }
    await this.prisma.purchaseOrder.delete({ where: { id } });
    return { deleted: true };
  }

  private rethrowUnique(error: unknown, message: string): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException(message);
    }
    throw error;
  }
}
