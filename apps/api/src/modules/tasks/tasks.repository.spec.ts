import { TasksRepository } from './tasks.repository';

function setup() {
  const findMany = jest.fn(() => Promise.resolve([]));
  const repository = new TasksRepository({ task: { findMany } } as never);
  const whereOf = () =>
    (
      findMany.mock.calls[0] as unknown as [{ where: Record<string, unknown> }]
    )[0].where;
  return { repository, whereOf };
}

describe('TasksRepository.findAll', () => {
  it('filters tasks without project for project=none, scoped to the organization', async () => {
    const { repository, whereOf } = setup();

    await repository.findAll('org-1', { withoutProject: true });

    expect(whereOf()).toMatchObject({
      organizationId: 'org-1',
      projectId: null,
    });
  });

  it('keeps the projectId filter unchanged', async () => {
    const { repository, whereOf } = setup();

    await repository.findAll('org-1', { projectId: 'p-1' });

    expect(whereOf()).toMatchObject({
      organizationId: 'org-1',
      projectId: 'p-1',
    });
  });

  it('does not filter on project by default', async () => {
    const { repository, whereOf } = setup();

    await repository.findAll('org-1', {});

    expect(whereOf()).not.toHaveProperty('projectId');
  });
});
