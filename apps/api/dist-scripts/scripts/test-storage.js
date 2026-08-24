"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const s3_storage_adapter_1 = require("../src/common/storage/s3-storage.adapter");
async function main() {
    const storage = new s3_storage_adapter_1.S3StorageAdapter();
    const testKey = 'test/roundtrip-check.txt';
    const testContent = Buffer.from('Storage-Roundtrip-Test erfolgreich');
    console.log('1. Upload...');
    await storage.upload({ key: testKey, data: testContent, mimeType: 'text/plain' });
    console.log('   OK');
    console.log('2. Existenz-Check...');
    const exists = await storage.exists(testKey);
    console.log('   Existiert:', exists);
    console.log('3. Signed Download-URL erzeugen...');
    const url = await storage.createDownloadUrl(testKey, 60);
    console.log('   URL:', url);
    console.log('4. Download über die URL...');
    const response = await fetch(url);
    const downloadedText = await response.text();
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
