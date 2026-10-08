import { loadMyTasks } from './dashboard-data';

describe('loadMyTasks', () => {
  it('includes tasks without project with a null projectName', async () => {
    const findMany = jest.fn(() =>
      Promise.resolve([
        {
          id: 't1',
          title: 'Ohne Projekt',
          project: null,
          priority: 'MEDIUM',
          dueAt: new Date('2000-01-01'),
          status: 'OPEN',
          createdAt: new Date('2000-01-01'),
        },
        {
          id: 't2',
          title: 'Mit Projekt',
          project: { name: 'Halle' },
          priority: 'HIGH',
          dueAt: null,
          status: 'OPEN',
          createdAt: new Date('2000-01-02'),
        },
      ]),
    );

    const result = await loadMyTasks(
      { task: { findMany } } as never,
      'org-1',
      'user-1',
    );

    expect(result).toEqual([
      expect.objectContaining({ id: 't1', projectName: null, isOverdue: true }),
      expect.objectContaining({ id: 't2', projectName: 'Halle' }),
    ]);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'org-1',
          assignments: { some: { userId: 'user-1' } },
        }),
      }),
    );
  });
});
