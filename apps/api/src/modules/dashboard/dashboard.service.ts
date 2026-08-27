import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  loadMyTasks,
  loadNextEvent,
  loadProjectsForEvaluation,
  loadRecentActivities,
} from './dashboard-data';
import { evaluateProjectAttention } from './dashboard-rules';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboard(organizationId: string, userId: string) {
    const now = new Date();
    const startOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );
    const endOfToday = new Date(startOfToday);
    endOfToday.setDate(endOfToday.getDate() + 1);

    const [
      projectsForEvaluation,
      activeProjectsCount,
      openTasksCount,
      dueTodayTasksCount,
      waitingTasksCount,
      nextEvent,
      myTasks,
      recentActivities,
    ] = await Promise.all([
      loadProjectsForEvaluation(this.prisma, organizationId),
      this.prisma.project.count({
        where: { organizationId, archivedAt: null, status: 'ACTIVE' },
      }),
      this.prisma.task.count({
        where: {
          organizationId,
          archivedAt: null,
          status: { notIn: ['COMPLETED', 'CANCELLED'] },
        },
      }),
      this.prisma.task.count({
        where: {
          organizationId,
          archivedAt: null,
          status: { notIn: ['COMPLETED', 'CANCELLED'] },
          dueAt: { gte: startOfToday, lt: endOfToday },
        },
      }),
      this.prisma.task.count({
        where: { organizationId, archivedAt: null, status: 'WAITING' },
      }),
      loadNextEvent(this.prisma, organizationId),
      loadMyTasks(this.prisma, organizationId, userId),
      loadRecentActivities(this.prisma, organizationId),
    ]);

    const evaluations = projectsForEvaluation.map((project) => ({
      project,
      reasons: evaluateProjectAttention(project, now),
    }));

    const projectsNeedingAttention = evaluations.filter(
      (evaluation) => evaluation.reasons.length > 0,
    );
    const projectsOnTrackCount =
      projectsForEvaluation.length - projectsNeedingAttention.length;

    const message =
      projectsNeedingAttention.length === 0
        ? `${projectsOnTrackCount} Projekte laufen planmäßig.`
        : `${projectsOnTrackCount} Projekte laufen planmäßig, ${projectsNeedingAttention.length} benötigen Aufmerksamkeit.`;

    return {
      summary: {
        activeProjects: activeProjectsCount,
        openTasks: openTasksCount,
        dueTodayTasks: dueTodayTasksCount,
        waitingTasks: waitingTasksCount,
      },
      dayStatus: {
        projectsOnTrack: projectsOnTrackCount,
        projectsNeedingAttention: projectsNeedingAttention.length,
        message,
      },
      nextEvent: nextEvent
        ? {
            id: nextEvent.id,
            title: nextEvent.title,
            startsAt: nextEvent.startsAt,
            location: nextEvent.location,
          }
        : null,
      myTasks,
      projectsRequiringAttention: projectsNeedingAttention
        .slice(0, 5)
        .map(({ project, reasons }) => ({
          id: project.id,
          name: project.name,
          customerName: project.customerName,
          reasons,
        })),
      recentActivities,
    };
  }
}
