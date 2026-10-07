import { PrismaClient } from '@prisma/client';
import { env, isProduction } from './env';
import { logger } from './logger';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: isProduction
      ? [{ emit: 'event', level: 'warn' }, { emit: 'event', level: 'error' }]
      : [{ emit: 'event', level: 'warn' }, { emit: 'event', level: 'error' }],
    datasources: { db: { url: env.DATABASE_URL } },
  });

prisma.$on('warn' as never, (event: { message: string }) => logger.warn({ target: 'prisma' }, event.message));
prisma.$on('error' as never, (event: { message: string }) => logger.error({ target: 'prisma' }, event.message));

if (!isProduction) globalForPrisma.prisma = prisma;

export async function connectDatabase(): Promise<void> {
  await prisma.$connect();
  logger.info('Database connection established');
}

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
}

export type Prisma = typeof prisma;
