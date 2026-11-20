import 'dotenv/config';
import { S3StorageAdapter } from '../src/common/storage/s3-storage.adapter';

async function main() {
  const storage = new S3StorageAdapter();
  const testKey = 'test/roundtrip-check.txt';
  const testContent = Buffer.from('Storage-Roundtrip-Test erfolgreich');

  console.log('1. Upload...');
  await storage.upload({
    key: testKey,
    data: testContent,
    mimeType: 'text/plain',
  });
  console.log('   OK');

  console.log('2. Existenz-Check...');
  const exists = await storage.exists(testKey);
  console.log('   Existiert:', exists);

  console.log('3. Download als Stream...');
  const { body } = await storage.openDownload(testKey);
  const chunks: Buffer[] = [];
  for await (const chunk of body) chunks.push(Buffer.from(chunk as Buffer));
  const downloadedText = Buffer.concat(chunks).toString();
  console.log('   Inhalt:', downloadedText);
  console.log('   Stimmt überein:', downloadedText === testContent.toString());

  console.log('5. Löschen...');
  await storage.delete(testKey);
  console.log('   OK');

  console.log('6. Existenz-Check nach Löschen...');
  const existsAfterDelete = await storage.exists(testKey);
  console.log('   Existiert noch:', existsAfterDelete, '(sollte false sein)');
}

main().catch((err) => {
  console.error('FEHLER:', err);
  process.exit(1);
});
