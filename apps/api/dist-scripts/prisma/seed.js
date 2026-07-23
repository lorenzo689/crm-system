"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const client_1 = require("../generated/prisma/client");
const adapter_pg_1 = require("@prisma/adapter-pg");
const adapter = new adapter_pg_1.PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new client_1.PrismaClient({ adapter });
async function main() {
    const organization = await prisma.organization.findUnique({
        where: { slug: 'bissinger-lights' },
    });
    if (!organization) {
        throw new Error('Keine Organisation mit slug "bissinger-lights" gefunden. Bitte zuerst create-test-organization.ts ausfuehren.');
    }
    const customers = [
        {
            name: 'Metronom Theater Oberhausen',
            customerNumber: 'K-2001',
            status: 'ACTIVE',
            description: 'Referenzprojekt, Bestandskunde',
        },
        {
            name: 'Stadthalle Heidelberg',
            customerNumber: 'K-2002',
            status: 'ACTIVE',
            description: 'Bestandskunde, Veranstaltungsstätte',
        },
        {
            name: 'ÖVB Arena Bremen',
            customerNumber: 'K-2003',
            status: 'ACTIVE',
            description: 'Bestandskunde, Veranstaltungsstätte',
        },
        {
            name: 'UCI Luxe East Side Gallery Berlin',
            customerNumber: 'K-2004',
            status: 'ACTIVE',
            description: 'Referenzprojekt, Kinostandort',
        },
        {
            name: 'ArtLab Frankfurt (Max-Planck-Institut)',
            customerNumber: 'K-2005',
            status: 'ACTIVE',
            description: 'Referenzprojekt, Forschungseinrichtung',
        },
        {
            name: 'Digital Campus Bad Friedrichshall',
            customerNumber: 'K-2006',
            status: 'LEAD',
            description: 'Lead, Bildungscampus',
        },
        {
            name: 'Humboldt-Universität Berlin',
            customerNumber: 'K-2007',
            status: 'LEAD',
            description: 'Lead, Hochschule',
        },
        {
            name: 'Julius-Maximilians-Universität Würzburg',
            customerNumber: 'K-2008',
            status: 'LEAD',
            description: 'Lead, Hochschule',
        },
        {
            name: 'Planken Lichtspiele Mannheim',
            customerNumber: 'K-2009',
            status: 'ACTIVE',
            description: 'Bestandskunde, Kinostandort',
        },
        {
            name: 'Theaterhaus Stuttgart',
            customerNumber: 'K-2010',
            status: 'ACTIVE',
            description: 'Bestandskunde, Veranstaltungsstätte',
        },
        {
            name: 'Nationaltheater Mannheim',
            customerNumber: 'K-2011',
            status: 'INACTIVE',
            description: 'Bestandskunde, derzeit inaktiv',
        },
        {
            name: 'Traumpalast Leonberg (IMAX)',
            customerNumber: 'K-2012',
            status: 'INACTIVE',
            description: 'Bestandskunde, derzeit inaktiv',
        },
        {
            name: 'VILCO Bad Vilbel',
            customerNumber: 'K-2013',
            status: 'INACTIVE',
            description: 'Bestandskunde, derzeit inaktiv',
        },
        {
            name: 'Kurhaus Bad Vilbel',
            customerNumber: 'K-2014',
            status: 'ACTIVE',
            archivedAt: new Date('2026-01-15'),
            description: 'Archivierter Bestandskunde',
        },
        {
            name: 'CineStar Augsburg',
            customerNumber: 'K-2015',
            status: 'INACTIVE',
            archivedAt: new Date('2026-01-15'),
            description: 'Archivierter Bestandskunde',
        },
        {
            name: 'Stadthalle Lohr am Main',
            customerNumber: 'K-2016',
            status: 'INACTIVE',
            archivedAt: new Date('2026-01-15'),
            description: 'Archivierter Bestandskunde',
        },
        {
            name: 'Theater und Orchester Heidelberg',
            customerNumber: 'K-2017',
            status: 'INACTIVE',
            archivedAt: new Date('2026-01-15'),
            description: 'Archivierter Bestandskunde',
        },
        {
            name: 'Nibelungenfestspiele Worms',
            customerNumber: 'K-2018',
            status: 'INACTIVE',
            archivedAt: new Date('2026-01-15'),
            description: 'Archivierter Bestandskunde',
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
