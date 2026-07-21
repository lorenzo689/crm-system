"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const client_1 = require("../generated/prisma/client");
const adapter_pg_1 = require("@prisma/adapter-pg");
const adapter = new adapter_pg_1.PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new client_1.PrismaClient({ adapter });
async function main() {
    const userId = process.argv[2];
    if (!userId) {
        console.error('Usage: node create-test-organization.js <userId>');
        process.exit(1);
    }
    const organization = await prisma.organization.create({
        data: {
            name: 'Bissinger Lights',
            slug: 'bissinger-lights',
        },
    });
    const membership = await prisma.organizationMember.create({
        data: {
            organizationId: organization.id,
            userId: userId,
            role: 'OWNER',
        },
    });
    console.log('Organization:', organization);
    console.log('Membership:', membership);
}
main()
    .catch((e) => {
    console.error(e);
    process.exit(1);
})
    .finally(async () => {
    await prisma.$disconnect();
});
