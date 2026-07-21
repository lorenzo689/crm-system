import 'dotenv/config';
import { PrismaClient } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const organization = await prisma.organization.findUnique({
    where: { slug: 'bissinger-lights' },
  });

  if (!organization) {
    throw new Error(
      'Keine Organisation mit slug "bissinger-lights" gefunden. Bitte zuerst create-test-organization.ts ausfuehren.',
    );
  }

  const customers = [
    {
      name: 'Atelier Moser',
      customerNumber: 'K-1001',
      website: 'https://atelier-moser.de',
      description: 'Bestandskunde, Theaterprojekte',
    },
    {
      name: 'Nord Event GmbH',
      customerNumber: 'K-1002',
      website: 'https://nord-event.de',
      description: 'Eventtechnik, mehrere laufende Projekte',
    },
    {
      name: 'Studio Form',
      customerNumber: 'K-1003',
      description: 'Innenausbau, Retail Concept Wien',
    },
    {
      name: 'Kollektiv Nord',
      customerNumber: 'K-1004',
      website: 'https://kollektiv-nord.de',
    },
    {
      name: 'Bissinger Vertrieb',
      customerNumber: 'K-1005',
      description: 'Interner Ansprechpartner Showroom Duesseldorf',
    },
  ];

  for (const customer of customers) {
    await prisma.customer.upsert({
      where: {
        organizationId_customerNumber: {
          organizationId: organization.id,
          customerNumber: customer.customerNumber,
        },
      },
      update: {},
      create: {
        ...customer,
        organizationId: organization.id,
      },
    });
  }

  console.log(`${customers.length} Kunden geseedet.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
