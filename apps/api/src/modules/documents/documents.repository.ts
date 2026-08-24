import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { Prisma } from '../../../generated/prisma/client';

export type DocumentListFilters = {
  customerId?: string;
  projectId?: string;
  type?: Prisma.DocumentWhereInput['type'];
  archived?: boolean;
};

@Injectable()
export class DocumentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(organizationId: string, filters: DocumentListFilters) {
    const where: Prisma.DocumentWhereInput = {
      organizationId,
      ...(filters.customerId && { customerId: filters.customerId }),
      ...(filters.projectId && { projectId: filters.projectId }),
      ...(filters.type && { type: filters.type }),
      ...(filters.archived === true && { archivedAt: { not: null } }),
      ...(filters.archived === false && { archivedAt: null }),
    };

    return this.prisma.document.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      include: {
        author: { select: { id: true, displayName: true } },
        currentVersion: true,
        _count: { select: { versions: true } },
      },
    });
  }

  async findById(id: string, organizationId: string) {
    return this.prisma.document.findFirst({
      where: { id, organizationId },
      include: {
        author: { select: { id: true, displayName: true } },
        currentVersion: true,
        versions: {
          orderBy: { versionNumber: 'desc' },
          include: {
            uploadedBy: { select: { id: true, displayName: true } },
          },
        },
      },
    });
  }

  async create(data: Prisma.DocumentUncheckedCreateInput) {
    return this.prisma.document.create({
      data,
      include: {
        author: { select: { id: true, displayName: true } },
        currentVersion: true,
      },
    });
  }

  async update(id: string, data: Prisma.DocumentUpdateInput) {
    return this.prisma.document.update({
      where: { id },
      data,
      include: {
        author: { select: { id: true, displayName: true } },
        currentVersion: true,
      },
    });
  }

  async archive(id: string) {
    return this.prisma.document.update({
      where: { id },
      data: { archivedAt: new Date() },
    });
  }

  async createVersion(data: Prisma.DocumentVersionUncheckedCreateInput) {
    return this.prisma.documentVersion.create({
      data,
      include: {
        uploadedBy: { select: { id: true, displayName: true } },
      },
    });
  }

  async getNextVersionNumber(documentId: string): Promise<number> {
    const latest = await this.prisma.documentVersion.findFirst({
      where: { documentId },
      orderBy: { versionNumber: 'desc' },
      select: { versionNumber: true },
    });
    return (latest?.versionNumber ?? 0) + 1;
  }

  async setCurrentVersion(documentId: string, versionId: string) {
    return this.prisma.document.update({
      where: { id: documentId },
      data: { currentVersionId: versionId },
    });
  }
}
