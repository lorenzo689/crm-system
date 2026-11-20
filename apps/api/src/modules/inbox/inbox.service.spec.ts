import { Prisma } from '../../../generated/prisma/client';
import { InboxService, type ParsedMail } from './inbox.service';

const mail: ParsedMail = {
  messageId: '<abc@example.com>',
  fromAddress: 'kunde@example.com',
  fromName: 'Kunde',
  subject: 'Anfrage Lichttechnik',
  text: 'Wir brauchen 20 Scheinwerfer für den 3. Mai.',
  receivedAt: new Date('2026-10-17T08:00:00Z'),
};

type Triage = Record<string, unknown> | null;

function createService({
  aiConfigured = true,
  triage = {
    category: 'QUOTE_REQUEST',
    summary: 'Will ein Angebot für 20 Scheinwerfer.',
    needsAction: true,
    taskTitle: 'Angebot für 20 Scheinwerfer erstellen',
    priority: 'HIGH',
  },
}: { aiConfigured?: boolean; triage?: Triage } = {}) {
  const prisma = {
    contact: { findFirst: jest.fn().mockResolvedValue({ customerId: 'c1' }) },
    inboundEmail: {
      create: jest
        .fn()
        .mockImplementation(({ data }: { data: object }) =>
          Promise.resolve({ id: 'e1', ...data }),
        ),
      update: jest
        .fn()
        .mockImplementation(({ data }: { data: object }) =>
          Promise.resolve({ id: 'e1', ...data }),
        ),
    },
  };
  const ai = {
    isConfigured: jest.fn().mockReturnValue(aiConfigured),
    triageEmail: jest.fn().mockResolvedValue(triage),
  };
  const proposals = { create: jest.fn().mockResolvedValue({ id: 'p1' }) };
  const service = new InboxService(
    prisma as never,
    ai as never,
    proposals as never,
  );
  return { service, prisma, ai, proposals };
}

describe('InboxService.ingest', () => {
  it('links the mail to the customer of a known contact address', async () => {
    const { service, prisma } = createService({ aiConfigured: false });
    await service.ingest('org1', mail);
    expect(prisma.inboundEmail.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        customerId: 'c1',
        organizationId: 'org1',
      }) as object,
    });
  });

  it('ignores a mail that was already imported', async () => {
    const { service, prisma, ai } = createService();
    prisma.inboundEmail.create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('dup', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    await expect(service.ingest('org1', mail)).resolves.toBeNull();
    expect(ai.triageEmail).not.toHaveBeenCalled();
  });

  it('turns an actionable mail into a task proposal, never a direct action', async () => {
    const { service, proposals } = createService();
    await service.ingest('org1', mail);
    expect(proposals.create).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'CREATE_TASK',
        source: 'AGENT',
        dedupeKey: 'email:e1',
      }),
    );
  });

  it('marks spam as ignored without proposing anything', async () => {
    const { service, prisma, proposals } = createService({
      triage: {
        category: 'SPAM',
        summary: 'Werbung',
        needsAction: true,
        taskTitle: 'Klick hier',
        priority: 'LOW',
      },
    });
    await service.ingest('org1', mail);
    expect(prisma.inboundEmail.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'IGNORED' }) as object,
      }),
    );
    expect(proposals.create).not.toHaveBeenCalled();
  });

  it('keeps the mail when the AI triage fails', async () => {
    const { service, ai } = createService();
    ai.triageEmail.mockRejectedValueOnce(new Error('timeout'));
    await expect(service.ingest('org1', mail)).resolves.toMatchObject({
      id: 'e1',
    });
  });
});
