-- CreateEnum
CREATE TYPE "Theme" AS ENUM ('LIGHT', 'DARK', 'SYSTEM');

-- CreateEnum
CREATE TYPE "Density" AS ENUM ('COMPACT', 'COMFORTABLE');

-- CreateEnum
CREATE TYPE "TaskView" AS ENUM ('LIST', 'KANBAN');

-- CreateEnum
CREATE TYPE "CalendarViewSetting" AS ENUM ('AGENDA', 'MONTH', 'WEEK');

-- CreateEnum
CREATE TYPE "LandingPage" AS ENUM ('DASHBOARD', 'TASKS', 'CALENDAR', 'PROJECTS');

-- CreateTable
CREATE TABLE "user_settings" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "theme" "Theme" NOT NULL DEFAULT 'SYSTEM',
    "density" "Density" NOT NULL DEFAULT 'COMFORTABLE',
    "defaultTaskView" "TaskView" NOT NULL DEFAULT 'LIST',
    "showCompletedTasks" BOOLEAN NOT NULL DEFAULT true,
    "calendarDefaultView" "CalendarViewSetting" NOT NULL DEFAULT 'AGENDA',
    "defaultLandingPage" "LandingPage" NOT NULL DEFAULT 'DASHBOARD',
    "notificationsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "taskReminders" BOOLEAN NOT NULL DEFAULT true,
    "calendarReminders" BOOLEAN NOT NULL DEFAULT true,
    "overdueTaskAlerts" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_settings_userId_key" ON "user_settings"("userId");

-- AddForeignKey
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
