import { Module } from '@nestjs/common';
import { S3StorageAdapter } from './s3-storage.adapter';
import { STORAGE_SERVICE } from './storage.interface';

@Module({
  providers: [
    {
      provide: STORAGE_SERVICE,
      useClass: S3StorageAdapter,
    },
  ],
  exports: [STORAGE_SERVICE],
})
export class StorageModule {}
