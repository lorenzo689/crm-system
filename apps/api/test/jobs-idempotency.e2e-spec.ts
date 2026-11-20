/**
 * Sprint 3.1: duplicate side effects of the business jobs, on real PostgreSQL.
 *
 * - recurring invoices: exactly one draft per template and due date, even with
 *   overlapping instances, a failure between claim and creation, a lost lease
 *   and a re-run; the database itself refuses a second draft.
 * - calendar reminders: "sent" and the notification are one atomic step.
 */
import { BackgroundJobsService } from '../src/common/jobs/background-jobs.service';
import { JobLeaseLostError } from '../src/common/jobs/background-jobs.service';
import type { JobContext } from '../src/common/jobs/background-jobs.service';
import { RemindersSchedulerService } from '../src/modules/calendar-events/reminders-scheduler.service';
import { RecurringInvoicesService } from '../src/modules/recurring-invoices/recurring-invoices.service';
import { SalesDocumentsService } from '../src/modules/sales-documents/sales-documents.service';
import {
  createOrganization,
  createTestApp,
  createUser,
  resetDatabase,
  type TestApp,
} from './helpers/harness';

const ITEMS = [
  {
    description: 'Wartung',
    quantity: 1,
    unit: 'Stk',
    unitPriceCents: 10_000,
    vatRateBp: 1900,
  },
];
const DUE = new Date(Date.UTC(2026, 0, 1));

describe('business job side effects (real PostgreSQL)', () => {
  let t: TestApp;
  let recurring: RecurringInvoicesService;
  let reminders: RemindersSchedulerService;
  let jobs: BackgroundJobsService;
  let salesDocuments: SalesDocumentsService;

  beforeAll(async () => {
    process.env.BACKGROUND_JOBS = 'all';
    process.env.BACKGROUND_JOB_HEARTBEAT_MS = '3600000';
    t = await createTestApp();
    recurring = t.app.get(RecurringInvoicesService);
    reminders = t.app.get(RemindersSchedulerService);
    jobs = t.app.get(BackgroundJobsService);
    salesDocuments = t.app.get(SalesDocumentsService);
  });
  afterAll(async () => {
    await t.app.close();
  });
  beforeEach(async () => {
    await resetDatabase(t.prisma);
    await t.prisma.$executeRaw`DELETE FROM "background_job_runs"`;
  });

  async function templateFixture() {
    const org = await createOrganization(t.prisma);
    const owner = await createUser(t.prisma, org.id, 'OWNER');
    const customer = await t.prisma.customer.create({
      data: { organizationId: org.id, name: 'Kunde', customerNumber: 'K-1' },
    });
    const template = await t.prisma.recurringInvoice.create({
      data: {
        organizationId: org.id,
        customerId: customer.id,
        title: 'Wartung',
        intervalMonths: 1,
        nextRunDate: DUE,
        items: ITEMS,
      },
    });
    return { org, owner, customer, template };
  }

  const documentsOf = (templateId: string) =>
    t.prisma.salesDocument.findMany({
      where: { recurringInvoiceId: templateId },
    });

  describe('recurring invoices', () => {
    it('creates one draft and advances the schedule; a re-run creates nothing', async () => {
      const { org, template } = await templateFixture();

      await expect(recurring.runDue(org.id)).resolves.toBe(1);
      await expect(recurring.runDue(org.id)).resolves.toBe(0);

      const documents = await documentsOf(template.id);
      expect(documents).toHaveLength(1);
      expect(documents[0].recurrenceDate?.toISOString()).toBe(
        DUE.toISOString(),
      );
      const after = await t.prisma.recurringInvoice.findUniqueOrThrow({
        where: { id: template.id },
      });
      expect(after.nextRunDate.getTime()).toBeGreaterThan(DUE.getTime());
    });

    it('two overlapping runs (no lease at all) still create exactly one draft', async () => {
      const { org, template } = await templateFixture();
      const results = await Promise.all([
        recurring.runDue(org.id),
        recurring.runDue(org.id),
        recurring.runDue(org.id),
      ]);
      expect(results.reduce((sum, n) => sum + n, 0)).toBe(1);
      expect(await documentsOf(template.id)).toHaveLength(1);
    });

    it('a failure between claim and creation leaves nothing behind: no lost invoice, schedule unchanged, retried later', async () => {
      const { org, template } = await templateFixture();
      const create = jest
        .spyOn(salesDocuments, 'create')
        .mockRejectedValueOnce(new Error('crash after the claim'));

      await expect(recurring.runDue(org.id)).resolves.toBe(0);
      create.mockRestore();

      const untouched = await t.prisma.recurringInvoice.findUniqueOrThrow({
        where: { id: template.id },
      });
      expect(untouched.nextRunDate.toISOString()).toBe(DUE.toISOString());
      expect(await documentsOf(template.id)).toHaveLength(0);

      await expect(recurring.runDue(org.id)).resolves.toBe(1); // next run
      expect(await documentsOf(template.id)).toHaveLength(1);
    });

    it('the database refuses a second draft for the same template and due date', async () => {
      const { org, template } = await templateFixture();
      await recurring.runDue(org.id);
      const [first] = await documentsOf(template.id);
      await expect(
        t.prisma.salesDocument.create({
          data: {
            organizationId: org.id,
            type: 'INVOICE',
            number: 'ENTWURF-DUPLICATE',
            customerId: first.customerId,
            issueDate: first.issueDate,
            recurringInvoiceId: template.id,
            recurrenceDate: first.recurrenceDate,
          },
        }),
      ).rejects.toMatchObject({ code: 'P2002' });
    });

    it('a draft that already exists for the due date is not duplicated; the schedule still advances', async () => {
      const { org, customer, template } = await templateFixture();
      await t.prisma.salesDocument.create({
        data: {
          organizationId: org.id,
          type: 'INVOICE',
          number: 'ENTWURF-EXISTING',
          customerId: customer.id,
          issueDate: DUE,
          recurringInvoiceId: template.id,
          recurrenceDate: DUE,
        },
      });
      await expect(recurring.runDue(org.id)).resolves.toBe(0);
      expect(await documentsOf(template.id)).toHaveLength(1);
      const after = await t.prisma.recurringInvoice.findUniqueOrThrow({
        where: { id: template.id },
      });
      expect(after.nextRunDate.getTime()).toBeGreaterThan(DUE.getTime());
    });

    it('with a real lease: a run whose lease was taken over creates nothing and stops', async () => {
      const { org, template } = await templateFixture();
      let stopped: unknown;
      await jobs.run('recurring-invoices', async (context) => {
        // Another instance took the job over (new token, higher fence).
        await t.prisma
          .$executeRaw`UPDATE "background_job_runs" SET "runToken" = 'someone-else', "fence" = "fence" + 1 WHERE "name" = 'recurring-invoices'`;
        try {
          await recurring.runDue(org.id, context);
        } catch (error) {
          stopped = error;
          throw error;
        }
      });
      expect(stopped).toBeInstanceOf(JobLeaseLostError);
      expect(await documentsOf(template.id)).toHaveLength(0);
      const untouched = await t.prisma.recurringInvoice.findUniqueOrThrow({
        where: { id: template.id },
      });
      expect(untouched.nextRunDate.toISOString()).toBe(DUE.toISOString());
    });

    it('with a real lease: the scheduled job creates the draft and finishes cleanly', async () => {
      const { template } = await templateFixture();
      await expect(
        jobs.run('recurring-invoices', (context) =>
          recurring.runScheduled(context),
        ),
      ).resolves.toBe(true);
      expect(await documentsOf(template.id)).toHaveLength(1);
      const [state] = await t.prisma.$queryRaw<
        { lastStatus: string; lockedUntil: Date | null }[]
      >`SELECT "lastStatus","lockedUntil" FROM "background_job_runs" WHERE "name" = 'recurring-invoices'`;
      expect(state.lastStatus).toBe('succeeded');
      expect(state.lockedUntil).toBeNull();
    });
  });

  describe('calendar reminders', () => {
    async function reminderFixture() {
      const org = await createOrganization(t.prisma);
      const user = await createUser(t.prisma, org.id, 'OWNER');
      const event = await t.prisma.calendarEvent.create({
        data: {
          organizationId: org.id,
          createdByUserId: user.id,
          title: 'Aufmaß',
          startsAt: new Date(Date.now() + 3_600_000),
          endsAt: new Date(Date.now() + 7_200_000),
        },
      });
      const reminder = await t.prisma.reminder.create({
        data: {
          calendarEventId: event.id,
          userId: user.id,
          remindAt: new Date(Date.now() - 60_000),
        },
      });
      return { user, reminder };
    }
    const notificationsOf = (reminderId: string) =>
      t.prisma.notification.findMany({ where: { reminderId } });

    it('"sent" and the notification are created together, exactly once', async () => {
      const { reminder } = await reminderFixture();
      await reminders.processDueReminders();
      await reminders.processDueReminders();
      const after = await t.prisma.reminder.findUniqueOrThrow({
        where: { id: reminder.id },
      });
      expect(after.status).toBe('SENT');
      expect(await notificationsOf(reminder.id)).toHaveLength(1);
    });

    it('a failure while creating the notification does not leave a "sent" reminder without one', async () => {
      const { reminder } = await reminderFixture();
      // The notification insert fails INSIDE the transaction, after the claim
      // statement ran (like a crash at exactly this point).
      type Tx = { notification: unknown };
      type Run = (
        work: (tx: Tx) => Promise<unknown>,
        options?: object,
      ) => Promise<unknown>;
      const prisma = t.prisma as unknown as { $transaction: Run };
      const realTransaction = prisma.$transaction;
      const original: Run = (work, options) =>
        realTransaction.call(t.prisma, work, options) as Promise<unknown>;
      const spy = jest
        .spyOn(prisma, '$transaction')
        .mockImplementationOnce((work, options) =>
          original(
            (tx) =>
              work(
                new Proxy(tx, {
                  get: (target, property, receiver) =>
                    property === 'notification'
                      ? { create: () => Promise.reject(new Error('crash')) }
                      : (Reflect.get(target, property, receiver) as unknown),
                }),
              ),
            options,
          ),
        );
      await reminders.processDueReminders();
      spy.mockRestore();

      const after = await t.prisma.reminder.findUniqueOrThrow({
        where: { id: reminder.id },
      });
      expect(after.status).not.toBe('SENT');
      expect(await notificationsOf(reminder.id)).toHaveLength(0);
    });

    it('a run that lost its lease sends nothing and leaves the reminder PENDING', async () => {
      const { reminder } = await reminderFixture();
      const lost: JobContext = {
        signal: new AbortController().signal,
        runToken: 'old',
        fence: 1,
        assertLeaseHeld: () => undefined,
        runFenced: () =>
          Promise.reject(new JobLeaseLostError('calendar-reminders')),
      };
      await expect(reminders.processDueReminders(lost)).rejects.toBeInstanceOf(
        JobLeaseLostError,
      );
      const after = await t.prisma.reminder.findUniqueOrThrow({
        where: { id: reminder.id },
      });
      expect(after.status).toBe('PENDING');
      expect(await notificationsOf(reminder.id)).toHaveLength(0);
    });
  });
});
