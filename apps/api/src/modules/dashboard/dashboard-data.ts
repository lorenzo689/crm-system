import { PrismaService } from "src/common/prisma/prisma.service";
import { evaluateProjectAttention } from './dashboard-rules';

export async function loadProjectsForEvaluation (
    prisma: PrismaService,
    organizationId: string,
){
    const now = new Date();

    const projects = await prisma.project.findMany({
        where: {
            organizationId,
            archivedAt: null,
            status: { notIn: ['COMPLETED', 'CANCELLED'] },
        },
        include: {
            customer: { select: { name: true } },
            members: { select: { id: true} },
            tasks: {
                where: { archivedAt: null },
                select: { status: true, dueAt: true },
            },
        },
    });

    return projects.map((project) => ({
        id: project.id, 
        name: project.name,
        customerName: project.customer?.name ?? null,
        status: project.status, 
        endsAt: project.endsAt, 
        memberCount: project.members.length, 
        hasOverdueTask: project.tasks.some(
            (t) =>
                t.dueAt &&
                t.dueAt < now &&
                t.status !== 'COMPLETED' &&
                t.status !== 'CANCELLED',
        ),
        hasBlockedTask: project.tasks.some((t) => t.status === 'BLOCKED'),
    }));
}


export async function loadNextEvent(prisma: PrismaService, organizationId: string) {
    const now = new Date();

    const event = await prisma.calendarEvent.findFirst({
        where: {
            organizationId, 
            archivedAt: null, 
            status: 'SCHEDULED',
            startsAt: { gt: now },
        },
        orderBy: { startsAt: 'asc' },
        select: {
            id: true, 
            title: true, 
            startsAt: true, 
            location: true,
        },
    });

    return event; 
}


export async function loadMyTasks (
    prisma: PrismaService, 
    organizationId: string, 
    userId: string, 
) {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday = new Date(startOfToday);
    endOfToday.setDate(endOfToday.getDate() + 1);

    const tasks = await prisma.task.findMany({
        where: {
            organizationId, 
            archivedAt: null, 
            status: { notIn: ['COMPLETED', 'CANCELLED']}, 
            assignments: { some: { userId }},
        }, 
        include: {
            project: { select: { name: true } },
        },
    });

    const withComputedFields = tasks.map((task) => {
        const isOverdue = Boolean (
            task.dueAt && task.dueAt < startOfToday,
        );
        const isDueToday = Boolean (
            task.dueAt && task.dueAt >= startOfToday && task.dueAt < endOfToday,
        );

        return {
            id: task.id, 
            title: task.title,
            projectName: task.project?.name ?? null, 
            priority: task.priority, 
            dueAt: task.dueAt, 
            status: task.status, 
            isOverdue, 
            isDueToday, 
            createdAt: task.createdAt,
        };
    });

    withComputedFields.sort((a, b) => {

        //1. überfällig zuerst 
        if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1; 

        //2. heute fällig als nächstes 
        if (a.isDueToday !== b.isDueToday) return a.isDueToday ? -1 : 1;

        //3. High priority vor den anderen 
        const aIsHigh = a.priority === 'HIGH';
        const bIsHigh = b.priority === 'HIGH';

        if (aIsHigh !== bIsHigh) return aIsHigh ? -1 : 1;

        //4. nächstes dueAt zuerst (Tasks ohne dueeAt kommen danach)
        if (a.dueAt && b.dueAt) return a.dueAt.getTime() - b.dueAt.getTime();
        if (a.dueAt && !b.dueAt) return -1; 
        if (!a.dueAt && b.dueAt) return 1; 

        //5. Fallback: ältere Tasks zuerst 
        return a.createdAt.getTime() - b.createdAt.getTime();

    });

    return withComputedFields.slice(0, 5).map(({ createdAt, isDueToday, ...rest}) => rest);
}


export async function loadRecentActivities(prisma: PrismaService, organizationId: string) {
  const activities = await prisma.activity.findMany({
    where: {
      OR: [
        { customer: { organizationId } },
        { project: { organizationId } },
        { task: { organizationId } },
      ],
    },
    orderBy: { occurredAt: 'desc' },
    take: 10,
    include: {
      actor: { select: { displayName: true } },
    },
  });

  return activities.map((activity) => ({
    id: activity.id,
    type: activity.type,
    message: activity.message,
    occurredAt: activity.occurredAt,
  }));
}

export async function loadSummaryAndDayStatus(
  prisma: PrismaService,
  organizationId: string,
) {
  const now = new Date();
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  );
  const endOfToday = new Date(startOfToday);
  endOfToday.setDate(endOfToday.getDate() + 1);

  const [
    activeProjectsCount,
    openTasksCount,
    dueTodayTasksCount,
    waitingTasksCount,
  ] = await Promise.all([
    prisma.project.count({
      where: { organizationId, archivedAt: null, status: 'ACTIVE' },
    }),
    prisma.task.count({
      where: {
        organizationId,
        archivedAt: null,
        status: { notIn: ['COMPLETED', 'CANCELLED'] },
      },
    }),
    prisma.task.count({
      where: {
        organizationId,
        archivedAt: null,
        status: { notIn: ['COMPLETED', 'CANCELLED'] },
        dueAt: { gte: startOfToday, lt: endOfToday },
      },
    }),
    prisma.task.count({
      where: { organizationId, archivedAt: null, status: 'WAITING' },
    }),
  ]);

  const projectsForEvaluation = await loadProjectsForEvaluation(
    prisma,
    organizationId,
  );
  const evaluations = projectsForEvaluation.map((project) => ({
    project,
    reasons: evaluateProjectAttention(project, now),
  }));

  const projectsNeedingAttention = evaluations.filter(
    (evaluation) => evaluation.reasons.length > 0,
  ).length;
  const projectsOnTrack =
    projectsForEvaluation.length - projectsNeedingAttention;

  const message =
    projectsNeedingAttention === 0
      ? `${projectsOnTrack} Projekte laufen planmäßig.`
      : `${projectsOnTrack} Projekte laufen planmäßig, ${projectsNeedingAttention} benötigen Aufmerksamkeit.`;

  return {
    summary: {
      activeProjects: activeProjectsCount,
      openTasks: openTasksCount,
      dueTodayTasks: dueTodayTasksCount,
      waitingTasks: waitingTasksCount,
    },
    dayStatus: {
      projectsOnTrack,
      projectsNeedingAttention,
      message,
    },
  };
}
