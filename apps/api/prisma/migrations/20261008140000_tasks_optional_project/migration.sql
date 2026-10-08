-- Tasks may exist without a project (general to-do list).
ALTER TABLE "tasks" ALTER COLUMN "projectId" DROP NOT NULL;
