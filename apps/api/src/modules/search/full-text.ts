import type { PrismaService } from '../../common/prisma/prisma.service';

/**
 * Ranked German full-text search over document titles and extracted text.
 * The expressions match the GIN indexes from the
 * `document_fulltext_search` migration, so Postgres can use them.
 */
export async function findDocumentIdsByFullText(
  prisma: PrismaService,
  organizationId: string,
  query: string,
  limit: number,
): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    WITH q AS (SELECT websearch_to_tsquery('german', ${query}) AS query)
    SELECT d.id
    FROM documents d
    LEFT JOIN document_versions v ON v.id = d."currentVersionId"
    CROSS JOIN q
    WHERE d."organizationId" = ${organizationId}::uuid
      AND d."archivedAt" IS NULL
      AND (
        to_tsvector('german', d.title) @@ q.query
        OR to_tsvector('german', coalesce(v."extractedText", '')) @@ q.query
      )
    ORDER BY
      ts_rank(to_tsvector('german', d.title), q.query) * 2
      + ts_rank(to_tsvector('german', coalesce(v."extractedText", '')), q.query) DESC,
      d."updatedAt" DESC
    LIMIT ${limit}
  `;
  return rows.map((row) => row.id);
}
