/**
 * Sprint 5B, P0-A.1: issuing the same invoice twice at the same time.
 *
 * Two real HTTP requests (session cookie + CSRF) ask to issue the same draft.
 * A barrier on PrismaService.$transaction holds both requests right before
 * their transaction until BOTH have arrived there, i.e. both have already read
 * the document as DRAFT. This is the interleaving that a double click or two
 * users produce; it is forced deterministically, without sleeps.
 *
 * Expected: exactly one issuance (one number, stock moved once), the second
 * request gets a clear 409, and the database is consistent.
 */
import {
  asUser,
  createOrganization,
  createTestApp,
  createUser,
  resetDatabase,
  tokenFor,
  type TestApp,
} from './helpers/harness';

const api = (path: string) => `/api/v1${path}`;

type Run = (work: unknown, options?: unknown) => Promise<unknown>;

/**
 * Holds the next `parties` calls of prisma.$transaction until all of them have
 * arrived, then lets them run (the real transactions, unchanged).
 */
function transactionBarrier(t: TestApp, parties: number) {
  const prisma = t.prisma as unknown as { $transaction: Run };
  const real = prisma.$transaction;
  let arrived = 0;
  let open!: () => void;
  const allArrived = new Promise<void>((resolve) => (open = resolve));
  const spy = jest
    .spyOn(prisma, '$transaction')
    .mockImplementation(async (work, options) => {
      arrived += 1;
      if (arrived === parties) open();
      if (arrived <= parties) await allArrived;
      return real.call(t.prisma, work, options) as Promise<unknown>;
    });
  return { arrivedCount: () => arrived, restore: () => spy.mockRestore() };
}

describe('Issuing an invoice concurrently (real PostgreSQL)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t.app.close();
  });
  beforeEach(async () => {
    await resetDatabase(t.prisma);
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  async function draftInvoice() {
    const org = await createOrganization(t.prisma);
    const owner = await createUser(t.prisma, org.id, 'OWNER');
    const token = await tokenFor(t, owner);
    const customer = await t.prisma.customer.create({
      data: {
        organizationId: org.id,
        name: 'Testkunde',
        customerNumber: 'K-1',
      },
    });
    const article = await t.prisma.article.create({
      data: {
        organizationId: org.id,
        articleNumber: 'A-1',
        name: 'Strahler (synthetisch)',
        unitPriceCents: 10_000,
        trackStock: true,
        stockQuantity: 10,
      },
    });
    const created = await t
      .http()
      .post(api('/sales-documents'))
      .set(asUser(token))
      .send({
        type: 'INVOICE',
        customerId: customer.id,
        issueDate: '2027-03-01',
        items: [
          {
            articleId: article.id,
            description: 'Strahler',
            quantity: 2,
            unit: 'Stk',
            unitPriceCents: 10_000,
            vatRateBp: 1900,
          },
        ],
      });
    expect(created.status).toBe(201);
    const invoice = created.body as { id: string; status: string };
    expect(invoice.status).toBe('DRAFT');
    return { org, token, article, invoiceId: invoice.id };
  }

  const issue = (token: string, id: string) =>
    t
      .http()
      .post(api(`/sales-documents/${id}/status`))
      .set(asUser(token))
      .send({ status: 'SENT' });

  async function state(orgId: string, invoiceId: string, articleId: string) {
    const invoice = await t.prisma.salesDocument.findUniqueOrThrow({
      where: { id: invoiceId },
    });
    const article = await t.prisma.article.findUniqueOrThrow({
      where: { id: articleId },
    });
    const sequences = await t.prisma.numberSequence.findMany({
      where: { organizationId: orgId },
    });
    const activities = await t.prisma.activity.count({
      where: { type: 'INVOICE_STATUS_CHANGED' },
    });
    return { invoice, article, sequences, activities };
  }

  it('two simultaneous requests issue the invoice exactly once', async () => {
    const { org, token, article, invoiceId } = await draftInvoice();

    const barrier = transactionBarrier(t, 2);
    const responses = await Promise.all([
      issue(token, invoiceId),
      issue(token, invoiceId),
    ]);
    barrier.restore();
    expect(barrier.arrivedCount()).toBe(2); // both had read the draft

    const statuses = responses.map((r) => r.status).sort();
    const after = await state(org.id, invoiceId, article.id);

    // One comparison of the whole outcome, so a failure shows all of it.
    expect({
      statuses,
      invoiceStatus: after.invoice.status,
      number: after.invoice.number,
      sequences: after.sequences.map((s) => `${s.key}=${s.lastValue}`),
      stock: after.article.stockQuantity,
      statusActivities: after.activities,
    }).toEqual({
      statuses: [201, 409], // exactly one success
      invoiceStatus: 'SENT',
      number: 'RE-2027-0001', // one valid number
      sequences: ['INVOICE-2027=1'], // no number consumed twice
      stock: 8, // 10 - 2, moved exactly once
      statusActivities: 1, // issued once
    });
    // The losing request is told why.
    const rejected = responses.find((r) => r.status === 409)!;
    expect((rejected.body as { message: string }).message).toMatch(
      /zwischenzeitlich/,
    );
  });

  it('a failure inside the issuing transaction rolls back status, number and stock', async () => {
    const { org, token, article, invoiceId } = await draftInvoice();

    // The stock update fails INSIDE the transaction (after the number was taken).
    const prisma = t.prisma as unknown as { $transaction: Run };
    const real = prisma.$transaction;
    jest.spyOn(prisma, '$transaction').mockImplementationOnce(
      (work, options) =>
        real.call(
          t.prisma,
          (tx: object) =>
            (work as (tx: object) => Promise<unknown>)(
              new Proxy(tx, {
                get: (target, property, receiver) =>
                  property === 'article'
                    ? {
                        findUnique: (args: unknown) =>
                          (
                            Reflect.get(target, 'article', receiver) as {
                              findUnique: (a: unknown) => Promise<unknown>;
                            }
                          ).findUnique(args),
                        update: () =>
                          Promise.reject(new Error('stock write failed')),
                      }
                    : (Reflect.get(target, property, receiver) as unknown),
              }),
            ),
          options,
        ) as Promise<unknown>,
    );

    const response = await issue(token, invoiceId);
    expect(response.status).toBe(500);

    const after = await state(org.id, invoiceId, article.id);
    expect(after.invoice.status).toBe('DRAFT');
    expect(after.invoice.number).toMatch(/^ENTWURF-/);
    expect(after.sequences).toEqual([]);
    expect(after.article.stockQuantity).toBe(10);

    // And it can be issued normally afterwards.
    jest.restoreAllMocks();
    expect((await issue(token, invoiceId)).status).toBe(201);
    const issued = await state(org.id, invoiceId, article.id);
    expect(issued.invoice.number).toBe('RE-2027-0001');
    expect(issued.article.stockQuantity).toBe(8);
  });

  it('issuing an already issued invoice again is refused and changes nothing', async () => {
    const { org, token, article, invoiceId } = await draftInvoice();
    expect((await issue(token, invoiceId)).status).toBe(201);
    const second = await issue(token, invoiceId);
    expect(second.status).toBe(400);
    const after = await state(org.id, invoiceId, article.id);
    expect(after.invoice.number).toBe('RE-2027-0001');
    expect(after.article.stockQuantity).toBe(8);
    expect(after.sequences[0].lastValue).toBe(1);
  });
  // --- Sprint 5B review follow-up -----------------------------------------

  /** Another draft of the same organization, customer and article. */
  async function anotherDraft(
    token: string,
    customerId: string,
    articleId: string,
    quantity: number,
  ) {
    const created = await t
      .http()
      .post(api('/sales-documents'))
      .set(asUser(token))
      .send({
        type: 'INVOICE',
        customerId,
        issueDate: '2027-03-01',
        items: [
          {
            articleId,
            description: 'Strahler',
            quantity,
            unit: 'Stk',
            unitPriceCents: 10_000,
            vatRateBp: 1900,
          },
        ],
      });
    expect(created.status).toBe(201);
    return (created.body as { id: string }).id;
  }

  const editItems = (token: string, id: string, articleId: string) =>
    t
      .http()
      .patch(api(`/sales-documents/${id}`))
      .set(asUser(token))
      .send({
        items: [
          {
            articleId,
            description: 'Strahler, geänderte Menge',
            quantity: 5,
            unit: 'Stk',
            unitPriceCents: 10_000,
            vatRateBp: 1900,
          },
        ],
      });

  /**
   * Waits until both requests have read the document and reached their
   * transaction, then runs the transaction of `first` completely and only
   * afterwards the one of the other request. Which request a transaction
   * belongs to is read from the call stack (service method name).
   */
  function sequencedTransactions(first: 'update' | 'changeStatus') {
    const prisma = t.prisma as unknown as { $transaction: Run };
    const real = prisma.$transaction;
    let arrived = 0;
    const seen: string[] = [];
    let release!: () => void;
    const bothArrived = new Promise<void>((resolve) => (release = resolve));
    let firstDone!: () => void;
    const firstFinished = new Promise<void>((resolve) => (firstDone = resolve));
    jest
      .spyOn(prisma, '$transaction')
      .mockImplementation(async (work, options) => {
        const stack = new Error().stack ?? '';
        const name = /SalesDocumentsService\.changeStatus/.test(stack)
          ? 'changeStatus'
          : /SalesDocumentsService\.update/.test(stack)
            ? 'update'
            : 'other';
        if (name === 'other') {
          return real.call(t.prisma, work, options) as Promise<unknown>;
        }
        arrived += 1;
        seen.push(name);
        if (arrived === 2) release();
        await bothArrived;
        if (name !== first) await firstFinished;
        try {
          return await (real.call(t.prisma, work, options) as Promise<unknown>);
        } finally {
          if (name === first) firstDone();
        }
      });
    // The ordering only works if both requests were recognised.
    return { recognised: () => [...seen].sort() };
  }

  /** Invariant: stock, items and totals of the issued invoice belong together. */
  async function expectConsistentIssuedInvoice(
    invoiceId: string,
    articleId: string,
  ) {
    const invoice = await t.prisma.salesDocument.findUniqueOrThrow({
      where: { id: invoiceId },
      include: { items: true },
    });
    const article = await t.prisma.article.findUniqueOrThrow({
      where: { id: articleId },
    });
    const quantity = invoice.items.reduce(
      (sum, item) => sum + Number(item.quantity),
      0,
    );
    const net = invoice.items.reduce((sum, item) => sum + item.netCents, 0);
    expect({
      status: invoice.status,
      number: invoice.number,
      stock: article.stockQuantity,
      netCents: invoice.netCents,
    }).toEqual({
      status: 'SENT',
      number: 'RE-2027-0001',
      stock: 10 - quantity, // stock moved for exactly the final items
      netCents: net, // totals belong to the final items
    });
    return { quantity };
  }

  it('A1: edit and issue at the same time, issue commits first: the edit is refused, the issued invoice stays unchanged', async () => {
    const { token, article, invoiceId } = await draftInvoice();
    const order = sequencedTransactions('changeStatus');
    const [issued, edited] = await Promise.all([
      issue(token, invoiceId),
      editItems(token, invoiceId, article.id),
    ]);
    jest.restoreAllMocks();
    expect(order.recognised()).toEqual(['changeStatus', 'update']);

    const { quantity } = await expectConsistentIssuedInvoice(
      invoiceId,
      article.id,
    );
    expect({ issue: issued.status, edit: edited.status, quantity }).toEqual({
      issue: 201,
      edit: 409, // an issued invoice must not be edited
      quantity: 2, // the original items stay
    });
  });

  it('A2: edit and issue at the same time, edit commits first: the invoice is issued with the edited items and stock follows them', async () => {
    const { token, article, invoiceId } = await draftInvoice();
    const order = sequencedTransactions('update');
    const [issued, edited] = await Promise.all([
      issue(token, invoiceId),
      editItems(token, invoiceId, article.id),
    ]);
    jest.restoreAllMocks();
    expect(order.recognised()).toEqual(['changeStatus', 'update']);

    const { quantity } = await expectConsistentIssuedInvoice(
      invoiceId,
      article.id,
    );
    expect({ issue: issued.status, edit: edited.status, quantity }).toEqual({
      issue: 201,
      edit: 200,
      quantity: 5, // the edited items were issued
    });
  });

  it('B: two different drafts issued at the same time get distinct numbers, stock moves once each', async () => {
    const { org, token, article, invoiceId } = await draftInvoice();
    const invoice = await t.prisma.salesDocument.findUniqueOrThrow({
      where: { id: invoiceId },
    });
    const secondId = await anotherDraft(
      token,
      invoice.customerId,
      article.id,
      3,
    );

    const barrier = transactionBarrier(t, 2);
    const responses = await Promise.all([
      issue(token, invoiceId),
      issue(token, secondId),
    ]);
    barrier.restore();

    const documents = await t.prisma.salesDocument.findMany({
      where: { id: { in: [invoiceId, secondId] } },
      orderBy: { number: 'asc' },
    });
    const after = await state(org.id, invoiceId, article.id);
    expect({
      statuses: responses.map((r) => r.status),
      numbers: documents.map((d) => d.number),
      documentStatuses: documents.map((d) => d.status),
      sequences: after.sequences.map((s) => `${s.key}=${s.lastValue}`),
      stock: after.article.stockQuantity,
      statusActivities: after.activities,
    }).toEqual({
      statuses: [201, 201],
      numbers: ['RE-2027-0001', 'RE-2027-0002'],
      documentStatuses: ['SENT', 'SENT'],
      sequences: ['INVOICE-2027=2'],
      stock: 10 - 2 - 3,
      statusActivities: 2,
    });
  });

  it('the losing request really waits on the row lock and then matches no row', async () => {
    const { org, token, article, invoiceId } = await draftInvoice();
    const prisma = t.prisma as unknown as { $transaction: Run };
    const real = prisma.$transaction;

    // Both requests read the draft first.
    let arrivals = 0;
    let bothRead!: () => void;
    const readDone = new Promise<void>((resolve) => (bothRead = resolve));
    // The winner pauses INSIDE its transaction after its claim (lock held).
    let holdWinner!: () => void;
    const winnerMayContinue = new Promise<void>((r) => (holdWinner = r));
    let winnerClaimed!: () => void;
    const claimedSignal = new Promise<void>((r) => (winnerClaimed = r));

    jest
      .spyOn(prisma, '$transaction')
      .mockImplementation(async (work, options) => {
        arrivals += 1;
        const me = arrivals;
        if (arrivals === 2) bothRead();
        await readDone;
        if (me === 1) {
          return real.call(
            t.prisma,
            (tx: object) =>
              (work as (tx: object) => Promise<unknown>)(
                new Proxy(tx, {
                  get: (target, property, receiver) => {
                    const value = Reflect.get(
                      target,
                      property,
                      receiver,
                    ) as unknown;
                    if (property !== 'numberSequence') return value;
                    const sequence = value as {
                      upsert: (a: unknown) => Promise<unknown>;
                    };
                    return {
                      upsert: async (args: unknown) => {
                        winnerClaimed();
                        await winnerMayContinue;
                        return sequence.upsert(args);
                      },
                    };
                  },
                }),
              ),
            options,
          ) as Promise<unknown>;
        }
        await claimedSignal; // the loser starts only while the winner holds the lock
        return real.call(t.prisma, work, options) as Promise<unknown>;
      });

    const responses = Promise.all([
      issue(token, invoiceId),
      issue(token, invoiceId),
    ]);
    await claimedSignal;
    // A condition, not a timer: wait until the loser's UPDATE waits on the
    // lock (bounded by wall time). The winner is released in every case, so
    // a failed check never leaves a transaction open for the next test.
    let blocked = 0;
    try {
      const deadline = Date.now() + 15_000;
      while (blocked === 0 && Date.now() < deadline) {
        const rows = await t.prisma.$queryRaw<{ n: bigint }[]>`
          SELECT count(*) AS n FROM pg_stat_activity
           WHERE datname = current_database()
             AND wait_event_type = 'Lock'
             AND query ILIKE '%UPDATE%sales_documents%'`;
        blocked = Number(rows[0].n);
        if (blocked === 0) await new Promise((r) => setImmediate(r));
      }
    } finally {
      holdWinner();
    }
    expect(blocked).toBeGreaterThanOrEqual(1);

    const statuses = (await responses).map((r) => r.status).sort();
    jest.restoreAllMocks();
    const after = await state(org.id, invoiceId, article.id);
    expect({
      statuses,
      number: after.invoice.number,
      stock: after.article.stockQuantity,
      sequences: after.sequences.map((s) => `${s.key}=${s.lastValue}`),
    }).toEqual({
      statuses: [201, 409],
      number: 'RE-2027-0001',
      stock: 8,
      sequences: ['INVOICE-2027=1'],
    });
  });
});
