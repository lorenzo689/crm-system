import type { PrismaService } from '../../common/prisma/prisma.service';
import { DocumentsRepository } from './documents.repository';

describe('DocumentsRepository', () => {
  const findMany = jest.fn();
  const prisma = { document: { findMany } };
  const repository = new DocumentsRepository(
    prisma as unknown as PrismaService,
  );

  beforeEach(() => {
    findMany.mockReset();
    findMany.mockResolvedValue([]);
  });

  it.each([
    ['all', {}],
    ['global', { customerId: null, projectId: null }],
    ['customer', { customerId: { not: null } }],
    ['project', { projectId: { not: null } }],
  ] as const)('applies the %s scope filter', async (scope, expected) => {
    await repository.findAll('organization-1', { scope });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'organization-1',
          archivedAt: null,
          ...expected,
        }),
      }),
    );
  });

  it('applies the document type filter and tenant boundary', async () => {
    await repository.findAll('organization-2', { type: 'DATASHEET' });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'organization-2',
          type: 'DATASHEET',
        }),
      }),
    );
  });

  it('searches title and tags case-insensitively', async () => {
    findMany.mockResolvedValueOnce([
      {
        id: 'title-match',
        title: 'Preisliste Herbst',
        tags: [],
        currentVersion: null,
      },
      {
        id: 'tag-match',
        title: 'Sortiment',
        tags: ['PREISLISTE'],
        currentVersion: null,
      },
      {
        id: 'no-match',
        title: 'Montageplan',
        tags: ['Technik'],
        currentVersion: null,
      },
    ]);
    findMany.mockResolvedValueOnce([]);

    const result = await repository.findAll('organization-1', {
      q: 'preisliste',
    });

    expect(result.map((document) => document.id)).toEqual([
      'title-match',
      'tag-match',
    ]);
  });

  it('searches the current original filename case-insensitively', async () => {
    findMany.mockResolvedValueOnce([
      {
        id: 'filename-match',
        title: 'Unterlagen',
        tags: [],
        currentVersion: { fileName: 'Datenblatt-LED.PDF' },
      },
    ]);
    findMany.mockResolvedValueOnce([]);

    const result = await repository.findAll('organization-1', {
      q: 'datenblatt-led.pdf',
    });

    expect(result).toHaveLength(1);
  });

  it('also finds documents whose current version text contains the query', async () => {
    findMany.mockImplementation((args: { select?: unknown }) =>
      Promise.resolve(
        args.select
          ? [{ id: 'content-match' }]
          : [
              {
                id: 'content-match',
                title: 'Rahmenvertrag',
                tags: [],
                currentVersion: { fileName: 'scan.pdf' },
              },
              {
                id: 'no-match',
                title: 'Montageplan',
                tags: [],
                currentVersion: { fileName: 'plan.pdf' },
              },
            ],
      ),
    );

    const result = await repository.findAll('organization-1', {
      q: 'Gewährleistung',
    });

    expect(result.map((document) => document.id)).toEqual(['content-match']);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'organization-1',
          archivedAt: null,
          currentVersion: {
            extractedText: { contains: 'gewährleistung', mode: 'insensitive' },
          },
        }),
        select: { id: true },
      }),
    );
  });

  it('never selects extractedText for API responses', async () => {
    await repository.findAll('organization-1', {});

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          currentVersion: expect.objectContaining({
            omit: { extractedText: true },
          }),
        }),
      }),
    );
  });

  it('loads the current version of a single document with uploader but without text', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const repo = new DocumentsRepository({
      document: { findFirst },
    } as unknown as PrismaService);

    await repo.findById('document-1', 'organization-1');

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          currentVersion: expect.objectContaining({
            omit: { extractedText: true },
            include: {
              uploadedBy: { select: { id: true, displayName: true } },
            },
          }),
          versions: expect.objectContaining({ omit: { extractedText: true } }),
        }),
      }),
    );
  });
});
