import { Redis } from 'ioredis';
import { env } from './env';
import { logger } from './logger';

export interface CacheStore {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>;
  delete(key: string): Promise<void>;
  deleteByPattern(pattern: string): Promise<void>;
  clear(): Promise<void>;
  readonly driver: 'redis' | 'memory';
}

class MemoryCacheStore implements CacheStore {
  readonly driver = 'memory' as const;

  private readonly store = new Map<string, { value: string; expiresAt: number }>();

  private sweep(): void {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (entry.expiresAt <= now) this.store.delete(key);
    }
  }

  get<T>(key: string): Promise<T | null> {
    const entry = this.store.get(key);
    if (!entry) return Promise.resolve(null);
    if (entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return Promise.resolve(null);
    }
    return Promise.resolve(JSON.parse(entry.value) as T);
  }

  set<T>(key: string, value: T, ttlSeconds: number = env.CACHE_TTL_SECONDS): Promise<void> {
    if (this.store.size > 5000) this.sweep();
    this.store.set(key, { value: JSON.stringify(value), expiresAt: Date.now() + ttlSeconds * 1000 });
    return Promise.resolve();
  }

  delete(key: string): Promise<void> {
    this.store.delete(key);
    return Promise.resolve();
  }

  deleteByPattern(pattern: string): Promise<void> {
    const regex = new RegExp(`^${pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`);
    for (const key of this.store.keys()) {
      if (regex.test(key)) this.store.delete(key);
    }
    return Promise.resolve();
  }

  clear(): Promise<void> {
    this.store.clear();
    return Promise.resolve();
  }
}

class RedisCacheStore implements CacheStore {
  readonly driver = 'redis' as const;

  constructor(private readonly client: Redis) {}

  async get<T>(key: string): Promise<T | null> {
    const raw = await this.client.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  }

  async set<T>(key: string, value: T, ttlSeconds: number = env.CACHE_TTL_SECONDS): Promise<void> {
    await this.client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  }

  async delete(key: string): Promise<void> {
    await this.client.del(key);
  }

  async deleteByPattern(pattern: string): Promise<void> {
    const stream = this.client.scanStream({ match: pattern, count: 200 }) as AsyncIterable<string[]>;
    const batch: string[] = [];
    for await (const keys of stream) {
      batch.push(...keys);
      if (batch.length >= 200) {
        await this.client.del(...batch);
        batch.length = 0;
      }
    }
    if (batch.length > 0) await this.client.del(...batch);
  }

  async clear(): Promise<void> {
    const keys = await this.client.keys('*');
    if (keys.length > 0) await this.client.del(...keys);
  }
}

function createStore(): CacheStore {
  if (!env.REDIS_URL) {
    logger.warn('REDIS_URL is not set — using in-memory cache (not shared between processes)');
    return new MemoryCacheStore();
  }

  const client = new Redis(env.REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    retryStrategy: (attempt) => Math.min(attempt * 200, 2000),
  });

  client.on('error', (error: Error) => {
    logger.warn({ err: error.message }, 'Redis connection error');
  });

  void client
    .connect()
    .then(() => logger.info('Redis cache connected'))
    .catch((error: unknown) => {
      logger.warn({ err: error instanceof Error ? error.message : String(error) }, 'Redis unavailable');
    });

  return new RedisCacheStore(client);
}

export const cache = createStore();

export async function disconnectCache(): Promise<void> {
  await cache.clear().catch(() => undefined);
}

export const cacheKeys = {
  employee: (id: string) => `employee:${id}`,
  employeeList: (hash: string) => `employees:list:${hash}`,
  dashboard: (role: string, employeeId: string) => `dashboard:${role}:${employeeId}`,
} as const;
