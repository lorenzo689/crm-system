import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { S3StorageAdapter } from '../src/common/storage/s3-storage.adapter';
import {
  TextExtractionService,
  isTextExtractable,
} from '../src/modules/documents/text-extraction.service';

const EXTRACTABLE_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

async function main() {
  const prisma = new PrismaClient({
    adapter: new PrismaPg(process.env.DATABASE_URL ?? ''),
  });
  const storage = new S3StorageAdapter();
  const extraction = new TextExtractionService();

  const versions = await prisma.documentVersion.findMany({
    where: { extractedText: null, mimeType: { in: EXTRACTABLE_MIME_TYPES } },
    orderBy: { createdAt: 'asc' },
    select: { id: true, storageKey: true, fileName: true, mimeType: true },
  });

  let processed = 0;
  let withText = 0;
  let pdfsWithoutText = 0;
  let errors = 0;

  for (const version of versions) {
    if (!isTextExtractable(version.mimeType)) continue;
    processed += 1;
    try {
      const buffer = await storage.download(version.storageKey);
      const text = await extraction.extract(buffer, version.mimeType);
      if (text) {
        await prisma.documentVersion.update({
          where: { id: version.id },
          data: { extractedText: text },
        });
        withText += 1;
      } else if (version.mimeType === 'application/pdf') {
        pdfsWithoutText += 1;
        console.log(`  kein Text (vermutlich Scan): ${version.fileName}`);
      }
    } catch (error) {
      errors += 1;
      console.log(
        `  Fehler bei ${version.fileName}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  console.log('Backfill abgeschlossen');
  console.log(`  verarbeitet:            ${processed}`);
  console.log(`  mit Text:               ${withText}`);
  console.log(`  PDFs ohne Textebene:    ${pdfsWithoutText}`);
  console.log(`  Fehler:                 ${errors}`);

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
