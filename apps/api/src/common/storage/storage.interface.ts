export interface StorageService {
  upload(input: { key: string; data: Buffer; mimeType: string }): Promise<void>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  createDownloadUrl(key: string, expiresInSeconds: number): Promise<string>;
}

export const STORAGE_SERVICE = Symbol('STORAGE_SERVICE');
