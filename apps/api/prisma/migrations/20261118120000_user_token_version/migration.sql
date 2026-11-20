-- Session invalidation counter; existing users start at 0 and stay active.
ALTER TABLE "users" ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 0;
