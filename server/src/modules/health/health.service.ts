import { prisma } from '../../config/prisma';
import { cache } from '../../config/cache';
import { ApiError } from '../../utils/ApiError';

export interface HealthReport {
  status: 'ok' | 'degraded';
  uptimeSeconds: number;
  timestamp: string;
  checks: {
    database: { status: 'up' | 'down'; latencyMs: number };
    cache: { driver: 'redis' | 'memory'; status: 'up' | 'down' };
  };
}

export async function getHealthReport(): Promise<HealthReport> {
  const startedAt = Date.now();

  let database: HealthReport['checks']['database'];
  try {
    await prisma.$queryRaw`SELECT 1`;
    database = { status: 'up', latencyMs: Date.now() - startedAt };
  } catch {
    database = { status: 'down', latencyMs: Date.now() - startedAt };
  }

  const cacheCheck = await (async () => {
    const key = 'health:ping';
    try {
      await cache.set(key, Date.now(), 10);
      const value = await cache.get<number>(key);
      return { driver: cache.driver, status: value ? ('up' as const) : ('down' as const) };
    } catch {
      return { driver: cache.driver, status: 'down' as const };
    }
  })();

  const status: HealthReport['status'] =
    database.status === 'up' && cacheCheck.status === 'up' ? 'ok' : 'degraded';

  return {
    status,
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
    checks: { database, cache: cacheCheck },
  };
}

export async function assertDatabaseReachable(): Promise<void> {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (error) {
    throw ApiError.internal(
      `Database is not reachable: ${error instanceof Error ? error.message : 'unknown error'}`,
    );
  }
}
