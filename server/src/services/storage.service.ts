import { GetObjectCommand, PutObjectCommand, S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { createReadStream } from 'node:fs';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Readable } from 'node:stream';
import { env } from '../config/env';
import { ApiError } from '../utils/ApiError';

/**
 * Storage sits behind this interface so the local disk driver and S3 stay
 * interchangeable. Callers only ever deal with opaque storage keys.
 */
export interface PutObjectInput {
  key: string;
  body: Buffer;
}

export interface StorageDriver {
  readonly driver: 'local' | 's3';
  put(input: PutObjectInput): Promise<void>;
  remove(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  readStream(key: string): Promise<Readable>;
  size(key: string): Promise<number>;
}

const SAFE_KEY = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;

/**
 * Rejects anything that could escape the storage root. Keys are generated
 * server side, so this is the last line of defence before touching the disk.
 */
function assertSafeKey(key: string): void {
  if (!SAFE_KEY.test(key) || key.includes('..')) throw ApiError.internal('Unsafe storage key');
}

class LocalDiskStorage implements StorageDriver {
  readonly driver = 'local' as const;
  private readonly root: string;

  constructor(root: string) {
    this.root = path.resolve(root);
  }

  private absolutePath(key: string): string {
    assertSafeKey(key);
    const target = path.resolve(this.root, key);
    if (!target.startsWith(this.root + path.sep)) throw ApiError.internal('Unsafe storage key');
    return target;
  }

  async put({ key, body }: PutObjectInput): Promise<void> {
    const target = this.absolutePath(key);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, body);
  }

  async remove(key: string): Promise<void> {
    await rm(this.absolutePath(key), { force: true });
  }

  async exists(key: string): Promise<boolean> {
    const info = await stat(this.absolutePath(key)).catch(() => null);
    return info !== null;
  }

  async readStream(key: string): Promise<Readable> {
    if (!(await this.exists(key))) throw ApiError.notFound('Stored file not found');
    return createReadStream(this.absolutePath(key));
  }

  async size(key: string): Promise<number> {
    const info = await stat(this.absolutePath(key)).catch(() => null);
    if (!info) throw ApiError.notFound('Stored file not found');
    return info.size;
  }
}

class S3Storage implements StorageDriver {
  readonly driver = 's3' as const;
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(
    bucket: string,
    region: string,
    endpoint: string,
    accessKeyId: string,
    secretAccessKey: string,
    forcePathStyle: boolean,
  ) {
    this.bucket = bucket;
    this.client = new S3Client({
      region,
      ...(endpoint ? { endpoint, forcePathStyle } : {}),
      credentials: { accessKeyId, secretAccessKey },
    });
  }

  async put({ key, body }: PutObjectInput): Promise<void> {
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body }));
  }

  async remove(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch {
      return false;
    }
  }

  async readStream(key: string): Promise<Readable> {
    try {
      const result = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      return result.Body as Readable;
    } catch {
      throw ApiError.notFound('Stored file not found');
    }
  }

  async size(key: string): Promise<number> {
    try {
      const result = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      return Number(result.ContentLength ?? 0);
    } catch {
      throw ApiError.notFound('Stored file not found');
    }
  }
}

let cached: StorageDriver | null = null;

export function storage(): StorageDriver {
  if (cached) return cached;

  cached =
    env.STORAGE_DRIVER === 's3'
      ? new S3Storage(
          env.STORAGE_S3_BUCKET,
          env.STORAGE_S3_REGION || 'us-east-1',
          env.STORAGE_S3_ENDPOINT,
          env.STORAGE_S3_ACCESS_KEY_ID,
          env.STORAGE_S3_SECRET_ACCESS_KEY,
          env.STORAGE_S3_FORCE_PATH_STYLE,
        )
      : new LocalDiskStorage(env.STORAGE_LOCAL_PATH);

  return cached;
}

const EXTENSION_BY_MIME: Record<string, string> = {
  'application/pdf': '.pdf',
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/webp': '.webp',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.ms-excel': '.xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'text/csv': '.csv',
  'text/plain': '.txt',
};

/**
 * Keys are namespaced by document id and never contain the original file name,
 * so an upload can never overwrite another document's file or leak a path.
 */
export function buildStorageKey(documentId: string, mimeType: string): string {
  const extension = EXTENSION_BY_MIME[mimeType.toLowerCase()] ?? '.bin';
  return `documents/${documentId}/${documentId}${extension}`;
}