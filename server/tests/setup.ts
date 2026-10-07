import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../.env.test'), override: true });
dotenv.config({ path: path.resolve(__dirname, '../.env') });

process.env.NODE_ENV = 'test';
process.env.LOG_PRETTY = 'false';
process.env.LOG_LEVEL = 'silent';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL must be set (loaded from server/.env.test) before running tests');
}

if (!process.env.DATABASE_URL.includes('_test')) {
  throw new Error(`Refusing to run tests against a non-test database: ${process.env.DATABASE_URL}`);
}
