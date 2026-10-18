import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AiChatService } from './ai-chat.service';
import { AiProposalsService } from './ai-proposals.service';
import { AiToolsService } from './ai-tools';

const createMock = jest.fn();
jest.mock('@anthropic-ai/sdk', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    beta: {
      messages: {
        // The service streams; each round resolves to the next mocked message.
        stream: (params: unknown) => {
          const final = createMock(params) as Promise<unknown>;
          return {
            async *[Symbol.asyncIterator]() {},
            finalMessage: () => final,
          };
        },
      },
    },
  })),
}));

const ctx = { organizationId: 'org1', userId: 'u1', userName: 'Test' };

describe('AiChatService', () => {
  const originalKey = process.env.ANTHROPIC_API_KEY;
  afterEach(() => {
    process.env.ANTHROPIC_API_KEY = originalKey;
    createMock.mockReset();
  });

  it('refuses to run without an API key', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const service = new AiChatService({} as AiToolsService);
    expect(service.isConfigured()).toBe(false);
    await expect(
      service.chat([{ role: 'user', content: 'hi' }], ctx),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('runs the tool loop and collects proposal ids', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    const tools = {
      run: jest.fn().mockResolvedValue({
        content: '{"proposalId":"p1"}',
        isError: false,
        proposalId: 'p1',
      }),
    };
    createMock
      .mockResolvedValueOnce({
        stop_reason: 'tool_use',
        content: [
          {
            type: 'tool_use',
            id: 't1',
            name: 'propose_task',
            input: { title: 'X' },
          },
        ],
      })
      .mockResolvedValueOnce({
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: 'Vorschlag liegt bereit.' }],
      });

    const service = new AiChatService(tools as unknown as AiToolsService);
    const result = await service.chat([{ role: 'user', content: 'Task' }], ctx);

    expect(result).toEqual({
      reply: 'Vorschlag liegt bereit.',
      proposalIds: ['p1'],
    });
    expect(tools.run).toHaveBeenCalledWith('propose_task', { title: 'X' }, ctx);
    // The tool result goes back as a user turn that follows the assistant tool_use.
    const secondCall = (
      createMock.mock.calls[1] as [{ messages: { content: unknown[] }[] }]
    )[0];
    expect(secondCall.messages.at(-1)?.content[0]).toMatchObject({
      type: 'tool_result',
      tool_use_id: 't1',
    });
  });

  it('answers politely when the request is refused', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    createMock.mockResolvedValueOnce({ stop_reason: 'refusal', content: [] });
    const service = new AiChatService({
      run: jest.fn(),
    } as unknown as AiToolsService);
    const result = await service.chat([{ role: 'user', content: 'x' }], ctx);
    expect(result.reply).toMatch(/nicht bearbeiten/);
  });
});

describe('AiToolsService', () => {
  it('turns tool errors into error results instead of throwing', async () => {
    const service = new AiToolsService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const outcome = await service.run('does_not_exist', {}, ctx);
    expect(outcome.isError).toBe(true);
    expect(outcome.content).toContain('Unbekanntes Werkzeug');
  });

  it('rejects malformed ids before touching the database', async () => {
    const prisma = { customer: { findFirst: jest.fn() } };
    const service = new AiToolsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const outcome = await service.run('get_customer', { id: "1' OR 1=1" }, ctx);
    expect(outcome.isError).toBe(true);
    expect(prisma.customer.findFirst).not.toHaveBeenCalled();
  });

  it('only records a proposal for write tools', async () => {
    const proposals = { create: jest.fn().mockResolvedValue({ id: 'p9' }) };
    const service = new AiToolsService(
      {} as never,
      {} as never,
      proposals as never,
      {} as never,
      {} as never,
    );
    const outcome = await service.run(
      'propose_task',
      { title: 'Anrufen' },
      ctx,
    );
    expect(outcome.proposalId).toBe('p9');
    expect(proposals.create).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'CREATE_TASK',
        source: 'CHAT',
        organizationId: 'org1',
      }),
    );
  });
});

describe('AiProposalsService', () => {
  function create(
    claimedCount: number,
    proposal: Record<string, unknown> = {},
  ) {
    const prisma = {
      aiProposal: {
        updateMany: jest.fn().mockResolvedValue({ count: claimedCount }),
        findFirst: jest.fn().mockResolvedValue({ status: 'APPROVED' }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'p1',
          kind: 'CREATE_TASK',
          payload: { title: 'Anrufen' },
          ...proposal,
        }),
        update: jest
          .fn()
          .mockImplementation(({ data }) => Promise.resolve(data)),
      },
    };
    const tasks = { create: jest.fn().mockResolvedValue({ id: 't1' }) };
    const service = new AiProposalsService(
      prisma as never,
      tasks as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    return { service, prisma, tasks };
  }

  it('executes an approved proposal exactly once', async () => {
    const { service, tasks } = create(1);
    await service.approve('p1', 'org1', 'u1');
    expect(tasks.create).toHaveBeenCalledWith(
      'org1',
      'u1',
      expect.objectContaining({ title: 'Anrufen' }),
    );
  });

  it('does not execute a proposal that was already decided', async () => {
    const { service, tasks } = create(0);
    await expect(service.approve('p1', 'org1', 'u1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(tasks.create).not.toHaveBeenCalled();
  });

  it('marks a proposal as failed when its payload is invalid', async () => {
    const { service, prisma, tasks } = create(1, {
      payload: { title: 42, evil: true },
    });
    await service.approve('p1', 'org1', 'u1');
    expect(tasks.create).not.toHaveBeenCalled();
    expect(prisma.aiProposal.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'FAILED' }) as object,
      }),
    );
  });
});
