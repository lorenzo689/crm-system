-- Trigram indexes so case-insensitive substring search (ILIKE '%q%') in global
-- search and document search does not need sequential scans.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX "customers_name_trgm_idx" ON "customers" USING GIN ("name" gin_trgm_ops);
CREATE INDEX "projects_name_trgm_idx" ON "projects" USING GIN ("name" gin_trgm_ops);
CREATE INDEX "projects_projectNumber_trgm_idx" ON "projects" USING GIN ("projectNumber" gin_trgm_ops);
CREATE INDEX "tasks_title_trgm_idx" ON "tasks" USING GIN ("title" gin_trgm_ops);
CREATE INDEX "documents_title_trgm_idx" ON "documents" USING GIN ("title" gin_trgm_ops);
CREATE INDEX "document_versions_fileName_trgm_idx" ON "document_versions" USING GIN ("fileName" gin_trgm_ops);
CREATE INDEX "document_versions_extractedText_trgm_idx" ON "document_versions" USING GIN ("extractedText" gin_trgm_ops);

-- Frequent list/filter paths
CREATE INDEX "tasks_organizationId_archivedAt_idx" ON "tasks" ("organizationId", "archivedAt");
CREATE INDEX "organization_members_userId_idx" ON "organization_members" ("userId");
