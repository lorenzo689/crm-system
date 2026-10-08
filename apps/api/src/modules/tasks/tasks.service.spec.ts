import { NotFoundException } from '@nestjs/common';
import { TasksService } from './tasks.service';

const ORG = 'org-1';
const USER = 'user-1';

function setup(existing: Record<string, unknown> = {}) {
  const repository = {
    create: jest.fn((data: Record<string, unknown>) =>
      Promise.resolve({ id: 'task-1', title: 'Rechnung', ...data }),
    ),
    update: jest.fn((id: string, data: Record<string, unknown>) =>
      Promise.resolve({ id, title: 'Rechnung', ...data }),
    ),
    findById: jest.fn(() =>
      Promise.resolve({
        id: 'task-1',
        title: 'Rechnung',
        status: 'OPEN',
        projectId: null,
        ...existing,
      }),
    ),
    archive: jest.fn(() => Promise.resolve({ id: 'task-1' })),
    findAll: jest.fn(() => Promise.resolve([])),
  };
  const prisma = {
    project: {
      findFirst: jest.fn(({ where }: { where: { organizationId: string } }) =>
        Promise.resolve(where.organizationId === ORG ? { id: 'p-1' } : null),
      ),
    },
  };
  const activities = { log: jest.fn(() => Promise.resolve()) };
  const service = new TasksService(
    repository as never,
    prisma as never,
    activities as never,
  );
  return { service, repository, prisma, activities };
}

describe('TasksService without project', () => {
  it('creates a task without a project and skips the project lookup', async () => {
    const { service, repository, prisma } = setup();

    await service.create(ORG, USER, { title: 'Rechnung' });

    expect(prisma.project.findFirst).not.toHaveBeenCalled();
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORG,
        createdByUserId: USER,
        title: 'Rechnung',
      }),
    );
    expect(repository.create.mock.calls[0][0].projectId).toBeUndefined();
  });

  it('still rejects a project from another organization on create', async () => {
    const { service, repository } = setup();

    await expect(
      service.create('org-2', USER, { title: 'x', projectId: 'p-1' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('logs activities with the task context only (no project)', async () => {
    const { service, activities } = setup();

    await service.create(ORG, USER, { title: 'Rechnung' });
    await service.complete('task-1', ORG, USER);
    await service.archive('task-1', ORG, USER);

    expect(activities.log).toHaveBeenCalledTimes(3);
    for (const [params] of activities.log.mock.calls as unknown as [
      Record<string, unknown>,
    ][]) {
      expect(params.taskId).toBe('task-1');
      expect(params.projectId).toBeUndefined();
      expect(params.customerId).toBeUndefined();
    }
  });

  it('assigns a project later', async () => {
    const { service, repository } = setup();

    await service.update('task-1', ORG, USER, { projectId: 'p-1' });

    expect(repository.update).toHaveBeenCalledWith(
      'task-1',
      expect.objectContaining({ project: { connect: { id: 'p-1' } } }),
    );
    expect(repository.update.mock.calls[0][1]).not.toHaveProperty('projectId');
  });

  it('removes the project with null', async () => {
    const { service, repository, prisma } = setup({ projectId: 'p-1' });

    await service.update('task-1', ORG, USER, { projectId: null });

    expect(prisma.project.findFirst).not.toHaveBeenCalled();
    expect(repository.update).toHaveBeenCalledWith(
      'task-1',
      expect.objectContaining({ project: { disconnect: true } }),
    );
  });

  it('leaves the project untouched when projectId is omitted', async () => {
    const { service, repository } = setup({ projectId: 'p-1' });

    await service.update('task-1', ORG, USER, { title: 'Neu' });

    expect(repository.update.mock.calls[0][1]).not.toHaveProperty('project');
  });

  it('rejects a foreign-organization project on update', async () => {
    const { service, repository } = setup();

    await expect(
      service.update('task-1', 'org-2', USER, { projectId: 'p-1' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(repository.update).not.toHaveBeenCalled();
  });
});
