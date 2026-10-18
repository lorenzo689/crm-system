import { BadRequestException, ConflictException } from '@nestjs/common';
import { FinanceService } from './finance.service';

const incoming = {
  id: 't1',
  status: 'UNMATCHED',
  amountCents: 11900,
  bookingDate: new Date('2026-10-17T00:00:00Z'),
  purpose: 'RE-2026-0001',
};

function setup(tx: Record<string, unknown> = incoming, claimed = 1) {
  const prisma = {
    bankTransaction: {
      findFirst: jest.fn().mockResolvedValue(tx),
      updateMany: jest.fn().mockResolvedValue({ count: claimed }),
      update: jest.fn().mockResolvedValue({}),
      findUniqueOrThrow: jest
        .fn()
        .mockResolvedValue({ id: 't1', status: 'MATCHED' }),
    },
    supplierInvoice: { findFirst: jest.fn(), update: jest.fn() },
    $transaction: jest.fn().mockResolvedValue([]),
  };
  const salesDocuments = { addPayment: jest.fn().mockResolvedValue({}) };
  const service = new FinanceService(prisma as never, salesDocuments as never);
  return { service, prisma, salesDocuments };
}

describe('FinanceService.matchTransaction', () => {
  it('books the payment with the transaction date and amount', async () => {
    const { service, salesDocuments } = setup();
    await service.matchTransaction('t1', 'org1', 'u1', {
      salesDocumentId: 'inv1',
    });
    expect(salesDocuments.addPayment).toHaveBeenCalledWith(
      'inv1',
      'org1',
      'u1',
      expect.objectContaining({ amountCents: 11900, paidAt: '2026-10-17' }),
    );
  });

  it('releases the transaction again when booking the payment fails', async () => {
    const { service, prisma, salesDocuments } = setup();
    salesDocuments.addPayment.mockRejectedValueOnce(new Error('exceeds'));
    await expect(
      service.matchTransaction('t1', 'org1', 'u1', { salesDocumentId: 'inv1' }),
    ).rejects.toThrow('exceeds');
    expect(prisma.bankTransaction.update).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: { status: 'UNMATCHED', salesDocumentId: null },
    });
  });

  it('does not book twice when two requests race', async () => {
    const { service, salesDocuments } = setup(incoming, 0);
    await expect(
      service.matchTransaction('t1', 'org1', 'u1', { salesDocumentId: 'inv1' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(salesDocuments.addPayment).not.toHaveBeenCalled();
  });

  it('refuses an already matched transaction', async () => {
    const { service } = setup({ ...incoming, status: 'MATCHED' });
    await expect(
      service.matchTransaction('t1', 'org1', 'u1', { salesDocumentId: 'inv1' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('keeps incoming money away from supplier invoices and vice versa', async () => {
    const { service } = setup();
    await expect(
      service.matchTransaction('t1', 'org1', 'u1', { supplierInvoiceId: 's1' }),
    ).rejects.toThrow(/Only outgoing/);

    const outgoing = setup({ ...incoming, amountCents: -5000 });
    await expect(
      outgoing.service.matchTransaction('t1', 'org1', 'u1', {
        salesDocumentId: 'i1',
      }),
    ).rejects.toThrow(/Only incoming/);
  });

  it('requires exactly one target', async () => {
    const { service } = setup();
    await expect(
      service.matchTransaction('t1', 'org1', 'u1', {}),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
