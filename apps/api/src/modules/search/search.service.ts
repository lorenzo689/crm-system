import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

const MAX_RESULTS_PER_CATEGORY = 5;
const MIN_QUERY_LENGTH = 2;
const SNIPPET_CONTEXT_CHARS = 40;

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search(organizationId: string, query: string) {
    const trimmedQuery = query.trim();

    if (trimmedQuery.length < MIN_QUERY_LENGTH) {
      return { customers: [], projects: [], tasks: [], documents: [] };
    }

    const [customers, projects, tasks, documents] = await Promise.all([
      this.prisma.customer.findMany({
        where: {
          organizationId,
          archivedAt: null,
          name: { contains: trimmedQuery, mode: 'insensitive' },
        },
        take: MAX_RESULTS_PER_CATEGORY,
        select: { id: true, name: true },
      }),
      this.prisma.project.findMany({
        where: {
          organizationId,
          archivedAt: null,
          OR: [
            { name: { contains: trimmedQuery, mode: 'insensitive' } },
            {
              projectNumber: {
                contains: trimmedQuery,
                mode: 'insensitive',
              },
            },
          ],
        },
        take: MAX_RESULTS_PER_CATEGORY,
        select: { id: true, name: true, projectNumber: true },
      }),
      this.prisma.task.findMany({
        where: {
          organizationId,
          archivedAt: null,
          title: { contains: trimmedQuery, mode: 'insensitive' },
        },
        take: MAX_RESULTS_PER_CATEGORY,
        select: { id: true, title: true },
      }),
      this.prisma.document.findMany({
        where: {
          organizationId,
          archivedAt: null,
          OR: [
            { title: { contains: trimmedQuery, mode: 'insensitive' } },
            {
              currentVersion: {
                fileName: { contains: trimmedQuery, mode: 'insensitive' },
              },
            },
            {
              currentVersion: {
                extractedText: { contains: trimmedQuery, mode: 'insensitive' },
              },
            },
          ],
        },
        orderBy: { updatedAt: 'desc' },
        take: MAX_RESULTS_PER_CATEGORY,
        select: {
          id: true,
          title: true,
          type: true,
          customer: { select: { id: true, name: true } },
          project: {
            select: {
              id: true,
              name: true,
              customer: { select: { name: true } },
            },
          },
        },
      }),
    ]);

    const snippets = await this.findContentSnippets(
      documents.map((document) => document.id),
      trimmedQuery,
    );

    return {
      customers: customers.map((customer) => ({
        id: customer.id,
        label: customer.name,
        href: `/customers?open=${customer.id}`,
      })),
      projects: projects.map((project) => ({
        id: project.id,
        label: `${project.name} (${project.projectNumber})`,
        href: `/projects/${project.id}`,
      })),
      tasks: tasks.map((task) => ({
        id: task.id,
        label: task.title,
        href: `/tasks?open=${task.id}`,
      })),
      documents: documents.map((document) => ({
        id: document.id,
        label: document.title,
        href: `/documents?open=${document.id}`,
        type: document.type,
        assignment: document.project
          ? {
              kind: 'project' as const,
              name: document.project.name,
              customerName: document.project.customer.name,
            }
          : document.customer
            ? { kind: 'customer' as const, name: document.customer.name }
            : { kind: 'global' as const },
        snippet: snippets.get(document.id) ?? null,
      })),
    };
  }

  /**
   * Short excerpt around the first content hit. Computed in SQL so the full
   * extracted text (up to 500k chars per document) never leaves the database.
   */
  private async findContentSnippets(documentIds: string[], query: string) {
    if (documentIds.length === 0) return new Map<string, string>();

    const lowered = query.toLowerCase();
    const length = query.length + SNIPPET_CONTEXT_CHARS * 2;
    const rows = await this.prisma.$queryRaw<{ id: string; snippet: string }[]>`
      SELECT d.id AS id,
        SUBSTRING(
          v."extractedText"
          FROM GREATEST(POSITION(${lowered} IN LOWER(v."extractedText")) - ${SNIPPET_CONTEXT_CHARS}::int, 1)
          FOR ${length}::int
        ) AS snippet
      FROM documents d
      JOIN document_versions v ON v.id = d."currentVersionId"
      WHERE d.id = ANY(${documentIds}::uuid[])
        AND POSITION(${lowered} IN LOWER(v."extractedText")) > 0
    `;

    return new Map(
      rows.map((row) => [row.id, row.snippet.replace(/\s+/g, ' ').trim()]),
    );
  }
}
