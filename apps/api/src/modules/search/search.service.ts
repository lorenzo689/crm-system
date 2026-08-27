import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

const MAX_RESULTS_PER_CATEGORY = 5;
const MIN_QUERY_LENGTH = 2;

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search(organizationId: string, query: string) {
    const trimmedQuery = query.trim();

    if (trimmedQuery.length < MIN_QUERY_LENGTH) {
      return { customers: [], projects: [], tasks: [] };
    }

    const [customers, projects, tasks] = await Promise.all([
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
    ]);

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
    };
  }
}
