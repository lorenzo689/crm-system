import type { Readable } from 'stream';

export interface StoredObjectStream {
  body: Readable;
  contentLength?: number;
}

export interface StorageService {
  upload(input: { key: string; data: Buffer; mimeType: string }): Promise<void>;
  download(key: string): Promise<Buffer>;
  /**
   * Streams an object without buffering it in memory. Keys always come from
   * the database (document versions), never from the client.
   */
  openDownload(key: string): Promise<StoredObjectStream>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  /** Cheap reachability check of the bucket (readiness probe). */
  ping(): Promise<void>;
}

export const STORAGE_SERVICE = Symbol('STORAGE_SERVICE');
