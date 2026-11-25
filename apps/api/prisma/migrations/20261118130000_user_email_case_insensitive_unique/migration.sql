-- E-mail addresses are unique regardless of case. Existing accounts are not
-- modified or merged: if two accounts only differ by case the migration stops
-- and lists them, so an administrator can decide which account stays
-- (see docs/security/sprint-1-auth-hardening.md, "E-Mail-Normalisierung").
DO $$
DECLARE
  conflicts text;
BEGIN
  SELECT string_agg(email || ' (' || cnt || ' Konten)', ', ')
    INTO conflicts
    FROM (
      SELECT lower("email") AS email, count(*) AS cnt
        FROM "users"
       GROUP BY lower("email")
      HAVING count(*) > 1
    ) AS duplicates;

  IF conflicts IS NOT NULL THEN
    RAISE EXCEPTION 'E-Mail-Konflikte (Konten unterscheiden sich nur in Gross-/Kleinschreibung): %. Bitte manuell klaeren und die Migration erneut ausfuehren. Vorab pruefen: pnpm --filter api user-admin check-emails', conflicts;
  END IF;
END $$;

CREATE UNIQUE INDEX "users_email_lower_key" ON "users" (lower("email"));
