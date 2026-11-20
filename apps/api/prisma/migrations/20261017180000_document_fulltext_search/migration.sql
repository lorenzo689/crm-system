-- German full-text search over document titles and extracted text. Unlike the
-- trigram index this matches word forms ("Rechnungen" finds "Rechnung") and
-- lets results be ranked by relevance.
CREATE INDEX "document_versions_extractedText_fts_idx"
  ON "document_versions"
  USING GIN (to_tsvector('german', coalesce("extractedText", '')));

CREATE INDEX "documents_title_fts_idx"
  ON "documents"
  USING GIN (to_tsvector('german', "title"));
