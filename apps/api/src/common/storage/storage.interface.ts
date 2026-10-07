export type DownloadUrlOptions = {
  /** 'attachment' forces a file download under `fileName`; 'inline' (default) leaves display to the browser. */
  disposition?: 'inline' | 'attachment';
  fileName?: string;
};

export interface StorageService {
  upload(input: { key: string; data: Buffer; mimeType: string }): Promise<void>;
  download(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  createDownloadUrl(
    key: string,
    expiresInSeconds: number,
    options?: DownloadUrlOptions,
  ): Promise<string>;
}

export const STORAGE_SERVICE = Symbol('STORAGE_SERVICE');
