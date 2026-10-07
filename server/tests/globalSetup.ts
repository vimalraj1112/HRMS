import path from 'node:path';
import { execSync } from 'node:child_process';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../.env.test'), override: true });
dotenv.config({ path: path.resolve(__dirname, '../.env') });

if (!process.env.DATABASE_URL?.includes('_test')) {
  throw new Error(`Refusing to seed a non-test database: ${process.env.DATABASE_URL}`);
}

export async function setup(): Promise<void> {
  const cwd = path.resolve(__dirname, '..');

  execSync('npx prisma migrate reset --force --skip-seed', {
    cwd,
    env: { ...process.env },
    stdio: 'ignore',
  });

  const { runSeed } = await import('../prisma/seed');
  const { prisma } = await import('../src/config/prisma');

  await runSeed();
  await prisma.$disconnect();
}

export async function teardown(): Promise<void> {
  const { prisma } = await import('../src/config/prisma');
  await prisma.$disconnect();
}
