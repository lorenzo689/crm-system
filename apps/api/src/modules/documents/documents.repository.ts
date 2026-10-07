import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { Prisma } from '../../../generated/prisma/client';

export type DocumentScope = 'all' | 'global' | 'customer' | 'project';

// extractedText is for search only and must never be part of API responses.
const versionOmit = { extractedText: true } as const;

export type DocumentListFilters = {
  customerId?: string;
  projectId?: string;
  q?: string;
  type?: Prisma.DocumentWhereInput['type'];
  scope?: DocumentScope;
  archived?: boolean;
};

@Injectable()
export class DocumentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(organizationId: string, filters: DocumentListFilters) {
    const scopeFilter: Prisma.DocumentWhereInput =
      filters.scope === 'global'
        ? { customerId: null, projectId: null }
        : filters.scope === 'customer'
          ? { customerId: { not: null } }
          : filters.scope === 'project'
            ? { projectId: { not: null } }
            : {};

    const where: Prisma.DocumentWhereInput = {
      organizationId,
      ...(filters.customerId && { customerId: filters.customerId }),
      ...(filters.projectId && { projectId: filters.projectId }),
      ...(filters.type && { type: filters.type }),
      ...scopeFilter,
      ...(filters.archived === true && { archivedAt: { not: null } }),
      ...(filters.archived !== true && { archivedAt: null }),
    };

    const query = filters.q?.trim().toLocaleLowerCase();

    const [documents, contentMatches] = await Promise.all([
      this.findListed(where),
      query
        ? this.prisma.document.findMany({
            where: {
              ...where,
              currentVersion: {
                extractedText: { contains: query, mode: 'insensitive' },
              },
            },
            select: { id: true },
          })
        : Promise.resolve([]),
    ]);

    if (!query) return documents;

    const contentMatchIds = new Set(contentMatches.map(({ id }) => id));
    return documents.filter(
      (document) =>
        document.title.toLocaleLowerCase().includes(query) ||
        document.tags.some((tag) => tag.toLocaleLowerCase().includes(query)) ||
        document.currentVersion?.fileName.toLocaleLowerCase().includes(query) ||
        contentMatchIds.has(document.id),
    );
  }

  private findListed(where: Prisma.DocumentWhereInput) {
    return this.prisma.document.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      include: {
        author: { select: { id: true, displayName: true } },
        customer: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } },
        currentVersion: {
          omit: versionOmit,
          include: {
            uploadedBy: { select: { id: true, displayName: true } },
          },
        },
        _count: { select: { versions: true } },
      },
    });
  }

  async findById(id: string, organizationId: string) {
    return this.prisma.document.findFirst({
      where: { id, organizationId },
      include: {
        author: { select: { id: true, displayName: true } },
        customer: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } },
        currentVersion: {
          omit: versionOmit,
          include: {
            uploadedBy: { select: { id: true, displayName: true } },
          },
        },
        versions: {
          omit: versionOmit,
          orderBy: { versionNumber: 'desc' },
          include: {
            uploadedBy: { select: { id: true, displayName: true } },
          },
        },
        _count: { select: { versions: true } },
      },
    });
  }

  async create(data: Prisma.DocumentUncheckedCreateInput) {
    return this.prisma.document.create({
      data,
      include: {
        author: { select: { id: true, displayName: true } },
        currentVersion: { omit: versionOmit },
      },
    });
  }

  async update(id: string, data: Prisma.DocumentUpdateInput) {
    return this.prisma.document.update({
      where: { id },
      data,
      include: {
        author: { select: { id: true, displayName: true } },
        currentVersion: { omit: versionOmit },
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
      omit: versionOmit,
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

  async setExtractedText(versionId: string, extractedText: string | null) {
    await this.prisma.documentVersion.update({
      where: { id: versionId },
      data: { extractedText },
    });
  }
}
