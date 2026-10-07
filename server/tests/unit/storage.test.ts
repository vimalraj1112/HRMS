import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildStorageKey, storage } from '../../src/services/storage.service';
import { ApiError } from '../../src/utils/ApiError';

const driver = storage();

async function expectUnsafe(key: string): Promise<void> {
  await expect(driver.exists(key)).rejects.toThrow(ApiError);
  await expect(driver.size(key)).rejects.toThrow(ApiError);
  await expect(driver.remove(key)).rejects.toThrow(ApiError);
  await expect(driver.readStream(key)).rejects.toThrow(ApiError);
  await expect(driver.put({ key, body: Buffer.from('nope') })).rejects.toThrow(ApiError);
}

describe('storage key safety', () => {
  it('rejects keys that escape the storage root', async () => {
    await expectUnsafe('../secrets.env');
    await expectUnsafe('documents/../../etc/passwd');
    await expectUnsafe('documents/./../../outside');
    await expectUnsafe('..');
  });

  it('rejects absolute paths, backslashes and unexpected characters', async () => {
    await expectUnsafe('/etc/passwd');
    await expectUnsafe('documents\\..\\windows\\system32');
    await expectUnsafe('documents/a b/c.txt');
    await expectUnsafe('documents/\u0000/c.txt');
    await expectUnsafe('documents/<script>/c.txt');
  });

  it('accepts the keys the application actually generates', async () => {
    const key = buildStorageKey(randomUUID(), 'application/pdf');
    await expect(driver.exists(key)).resolves.toBe(false);
  });

  it('resolves document keys to an opaque name with a known extension', () => {
    const id = randomUUID();
    expect(buildStorageKey(id, 'application/pdf')).toBe(`documents/${id}/${id}.pdf`);
    expect(buildStorageKey(id, 'image/png')).toBe(`documents/${id}/${id}.png`);
    expect(buildStorageKey(id, 'image/jpeg')).toBe(`documents/${id}/${id}.jpg`);
    expect(buildStorageKey(id, 'application/octet-stream')).toBe(`documents/${id}/${id}.bin`);
  });

  it('never lets a caller choose the file name', () => {
    const id = randomUUID();
    const key = buildStorageKey(id, 'application/pdf');
    expect(key).not.toContain('..');
    expect(key.endsWith(`/${id}.pdf`)).toBe(true);
  });
});
