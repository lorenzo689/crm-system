import { BadRequestException, ConflictException } from '@nestjs/common';
import { RentalService } from './rental.service';

const d = (value: string) => new Date(`${value}T00:00:00Z`);

function setup({
  rentalStock = 10,
  isRentable = true,
  bookings = [] as { quantity: number; startsOn: Date; endsOn: Date }[],
} = {}) {
  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(1),
    article: {
      findFirst: jest.fn().mockResolvedValue({
        isRentable,
        rentalStock,
        name: 'Moving Head',
      }),
    },
    reservation: {
      findMany: jest.fn().mockResolvedValue(bookings),
      create: jest
        .fn()
        .mockImplementation(({ data }: { data: object }) =>
          Promise.resolve({ id: 'r1', ...data }),
        ),
    },
  };
  const prisma = {
    $transaction: jest.fn((fn: (client: typeof tx) => Promise<unknown>) =>
      fn(tx),
    ),
    customer: { findFirst: jest.fn().mockResolvedValue({ id: 'c1' }) },
    project: { findFirst: jest.fn().mockResolvedValue({ id: 'p1' }) },
    reservation: { findFirst: jest.fn(), update: jest.fn() },
  };
  return { service: new RentalService(prisma as never), prisma, tx };
}

const dto = {
  articleId: 'a1',
  quantity: 4,
  startsOn: '2026-05-01',
  endsOn: '2026-05-03',
};

describe('RentalService.create', () => {
  it('books when enough units are free and takes the per-article lock', async () => {
    const { service, tx } = setup({
      bookings: [
        { quantity: 5, startsOn: d('2026-05-02'), endsOn: d('2026-05-02') },
      ],
    });
    await expect(service.create('org1', 'u1', dto)).resolves.toMatchObject({
      quantity: 4,
      status: 'CONFIRMED',
    });
    expect(tx.$executeRaw).toHaveBeenCalled();
  });

  it('rejects an overbooking and says how many are free', async () => {
    const { service, tx } = setup({
      bookings: [
        { quantity: 8, startsOn: d('2026-05-02'), endsOn: d('2026-05-02') },
      ],
    });
    await expect(service.create('org1', 'u1', dto)).rejects.toThrow(
      /Nur 2 von 4/,
    );
    await expect(service.create('org1', 'u1', dto)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(tx.reservation.create).not.toHaveBeenCalled();
  });

  it('rejects articles that are not rentable', async () => {
    const { service } = setup({ isRentable: false });
    await expect(service.create('org1', 'u1', dto)).rejects.toThrow(
      /not rentable/,
    );
  });

  it('rejects an end date before the start date', async () => {
    const { service } = setup();
    await expect(
      service.create('org1', 'u1', { ...dto, endsOn: '2026-04-01' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('RentalService.changeStatus', () => {
  it('allows returning a confirmed reservation', async () => {
    const { service, prisma } = setup();
    prisma.reservation.findFirst.mockResolvedValue({
      id: 'r1',
      status: 'CONFIRMED',
    });
    prisma.reservation.update.mockResolvedValue({
      id: 'r1',
      status: 'RETURNED',
    });
    await expect(
      service.changeStatus('r1', 'org1', 'RETURNED'),
    ).resolves.toMatchObject({
      status: 'RETURNED',
    });
  });

  it('does not reopen a cancelled reservation', async () => {
    const { service, prisma } = setup();
    prisma.reservation.findFirst.mockResolvedValue({
      id: 'r1',
      status: 'CANCELLED',
    });
    await expect(
      service.changeStatus('r1', 'org1', 'CONFIRMED'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
