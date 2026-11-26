/**
 * Sprint 5B, P0-A.1b: deleting a draft invoice while it is being issued.
 *
 * Two real HTTP requests (session cookie + CSRF): DELETE and "issue"
 * (status SENT) for the same draft. Both requests are held right after their
 * first read of the document (SalesDocumentsService.findOne), so both have
 * seen it as a DRAFT. Then one request is let through completely and only
 * after its HTTP answer arrived is the other one released. This forces each
 * commit order deterministically, without sleeps.
 */
import type { Server } from 'http';
import { SalesDocumentsService } from '../src/modules/sales-documents/sales-documents.service';
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

describe('Deleting an invoice while it is issued (real PostgreSQL)', () => {
  let t: TestApp;
  let service: SalesDocumentsService;

  beforeAll(async () => {
    t = await createTestApp();
    service = t.app.get(SalesDocumentsService);
    // Listen once up front. Otherwise supertest starts its own listener per
    // request and waits for server.close() after the first answer, which in
    // turn waits for the second (deliberately held) connection.
    const server = t.app.getHttpServer() as Server;
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
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
    return {
      org,
      token,
      article,
      invoiceId: (created.body as { id: string }).id,
    };
  }

  const issue = (token: string, id: string) =>
    t
      .http()
      .post(api(`/sales-documents/${id}/status`))
      .set(asUser(token))
      .send({ status: 'SENT' });
  const remove = (token: string, id: string) =>
    t
      .http()
      .delete(api(`/sales-documents/${id}`))
      .set(asUser(token));

  /**
   * Holds `remove` and `changeStatus` right after their findOne() until both
   * have read, then releases `first` and, once `firstDone` resolves, the other.
   */
  function afterBothRead(first: 'remove' | 'changeStatus') {
    type Found = Awaited<ReturnType<SalesDocumentsService['findOne']>>;
    // Bound before the spy replaces it, so the real lookup still runs.
    const original = service.findOne.bind(service) as (
      id: string,
      organizationId: string,
    ) => Promise<Found>;
    const real = (id: string, organizationId: string) =>
      original(id, organizationId);
    const seen: string[] = [];
    let bothRead!: () => void;
    const reads = new Promise<void>((resolve) => (bothRead = resolve));
    let releaseSecond!: () => void;
    const secondMayGo = new Promise<void>(
      (resolve) => (releaseSecond = resolve),
    );
    jest
      .spyOn(service, 'findOne')
      .mockImplementation(async (id: string, organizationId: string) => {
        const stack = new Error().stack ?? '';
        const name = /SalesDocumentsService\.remove/.test(stack)
          ? 'remove'
          : /SalesDocumentsService\.changeStatus/.test(stack)
            ? 'changeStatus'
            : 'other';

        const document = await real(id, organizationId);
        if (name === 'other') return document;
        seen.push(name);
        if (seen.length === 2) bothRead();
        await reads;
        if (name !== first) await secondMayGo;

        return document;
      });
    return {
      firstDone: () => releaseSecond(),
      recognised: () => [...seen].sort(),
    };
  }

  async function state(orgId: string, invoiceId: string, articleId: string) {
    const invoice = await t.prisma.salesDocument.findUnique({
      where: { id: invoiceId },
      include: { items: true },
    });
    const article = await t.prisma.article.findUniqueOrThrow({
      where: { id: articleId },
    });
    const sequences = await t.prisma.numberSequence.findMany({
      where: { organizationId: orgId },
    });
    const statusActivities = await t.prisma.activity.count({
      where: { type: 'INVOICE_STATUS_CHANGED' },
    });
    const orphanItems = await t.prisma.salesDocumentItem.count({
      where: { salesDocumentId: invoiceId },
    });
    return {
      exists: invoice !== null,
      status: invoice?.status ?? null,
      number: invoice?.number ?? null,
      items: invoice?.items.length ?? 0,
      orphanItems,
      sequences: sequences.map((s) => `${s.key}=${s.lastValue}`),
      stock: article.stockQuantity,
      statusActivities,
    };
  }

  it('issue wins: the issued invoice stays, the delete is refused', async () => {
    const { org, token, article, invoiceId } = await draftInvoice();
    const order = afterBothRead('changeStatus');
    // .then() sends the request now (supertest is lazy).
    const issuing = issue(token, invoiceId).then((r) => r);
    const deleting = remove(token, invoiceId).then((r) => r);
    const issued = await issuing; // the issue ran completely first

    order.firstDone();
    const deleted = await deleting;

    expect(order.recognised()).toEqual(['changeStatus', 'remove']);
    expect({
      issue: issued.status,
      delete: deleted.status,
      ...(await state(org.id, invoiceId, article.id)),
    }).toEqual({
      issue: 201,
      delete: 409, // an issued invoice must never be deleted
      exists: true,
      status: 'SENT',
      number: 'RE-2027-0001',
      items: 1,
      orphanItems: 1,
      sequences: ['INVOICE-2027=1'], // the number in use, no gap
      stock: 8, // booked once and still backed by the invoice
      statusActivities: 1,
    });
    expect((deleted.body as { message: string }).message).toMatch(
      /zwischenzeitlich/,
    );
  });

  it('delete wins: the draft is gone, the issue is refused, nothing was booked', async () => {
    const { org, token, article, invoiceId } = await draftInvoice();
    const order = afterBothRead('remove');
    // .then() sends the request now (supertest is lazy).
    const issuing = issue(token, invoiceId).then((r) => r);
    const deleting = remove(token, invoiceId).then((r) => r);
    const deleted = await deleting; // the delete ran completely first
    order.firstDone();
    const issued = await issuing;

    expect(order.recognised()).toEqual(['changeStatus', 'remove']);
    expect({
      issue: issued.status,
      delete: deleted.status,
      ...(await state(org.id, invoiceId, article.id)),
    }).toEqual({
      issue: 409,
      delete: 200,
      exists: false,
      status: null,
      number: null,
      items: 0,
      orphanItems: 0,
      sequences: [], // no number taken
      stock: 10, // nothing booked
      statusActivities: 0,
    });
  });

  it('sequentially: an issued invoice cannot be deleted (unchanged 400)', async () => {
    const { org, token, article, invoiceId } = await draftInvoice();
    expect((await issue(token, invoiceId)).status).toBe(201);
    const deleted = await remove(token, invoiceId);
    expect(deleted.status).toBe(400);
    const after = await state(org.id, invoiceId, article.id);
    expect(after.exists).toBe(true);
    expect(after.stock).toBe(8);
  });
});
