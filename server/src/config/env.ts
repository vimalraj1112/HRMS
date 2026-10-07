import path from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const booleanish = z
  .union([z.boolean(), z.string()])
  .transform((value) =>
    typeof value === 'boolean' ? value : ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase()),
  );

const csv = z
  .string()
  .default('')
  .transform((value) =>
    value
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean),
  );

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(4000),
    API_PREFIX: z.string().startsWith('/').default('/api/v1'),
    APP_NAME: z.string().min(1).default('SuperLink HRMS'),
    CORS_ORIGINS: csv,
    API_PUBLIC_URL: z.string().url().default('http://localhost:4000'),

    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

    JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
    JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
    JWT_ACCESS_TTL: z.string().default('15m'),
    JWT_REFRESH_TTL: z.string().default('7d'),
    BCRYPT_SALT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),
    LOGIN_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
    LOGIN_LOCK_MINUTES: z.coerce.number().int().positive().default(15),

    REDIS_URL: z.string().optional().default(''),
    CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(300),

    STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
    STORAGE_LOCAL_PATH: z.string().default('uploads'),
    STORAGE_S3_BUCKET: z.string().optional().default(''),
    STORAGE_S3_REGION: z.string().optional().default(''),
    STORAGE_S3_ENDPOINT: z.string().optional().default(''),
    STORAGE_S3_ACCESS_KEY_ID: z.string().optional().default(''),
    STORAGE_S3_SECRET_ACCESS_KEY: z.string().optional().default(''),
    STORAGE_S3_FORCE_PATH_STYLE: booleanish.default(true),

    UPLOAD_MAX_FILE_SIZE_MB: z.coerce.number().int().positive().default(10),
    UPLOAD_ALLOWED_MIME_TYPES: csv,

    RATE_LIMIT_WINDOW_MINUTES: z.coerce.number().int().positive().default(15),
    RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
    AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(20),

    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
    LOG_PRETTY: booleanish.default(true),
    DEBUG_ERROR_STACK: booleanish.default(false),

    SMTP_HOST: z.string().optional().default(''),
    SMTP_PORT: z.coerce.number().int().positive().default(587),
    SMTP_SECURE: booleanish.default(false),
    SMTP_USER: z.string().optional().default(''),
    SMTP_PASSWORD: z.string().optional().default(''),
    MAIL_FROM: z.string().default('SuperLink HRMS <no-reply@superlinkitservices.com>'),

    SEED_SUPER_ADMIN_EMAIL: z.string().email().default('superadmin@superlink.local'),
    SEED_SUPER_ADMIN_PASSWORD: z.string().min(8).default('ChangeMe@123'),
    SEED_HR_ADMIN_EMAIL: z.string().email().default('hradmin@superlink.local'),
    SEED_HR_ADMIN_PASSWORD: z.string().min(8).default('ChangeMe@123'),
    SEED_DEFAULT_PASSWORD: z.string().min(8).default('ChangeMe@123'),
  })
  .superRefine((value, ctx) => {
    if (value.NODE_ENV !== 'production') return;

    if (value.STORAGE_DRIVER === 's3') {
      const required = [
        ['STORAGE_S3_BUCKET', value.STORAGE_S3_BUCKET],
        ['STORAGE_S3_ACCESS_KEY_ID', value.STORAGE_S3_ACCESS_KEY_ID],
        ['STORAGE_S3_SECRET_ACCESS_KEY', value.STORAGE_S3_SECRET_ACCESS_KEY],
      ] as const;

      for (const [key, entry] of required) {
        if (!entry) {
          ctx.addIssue({ code: 'custom', path: [key], message: `${key} is required when STORAGE_DRIVER=s3` });
        }
      }
    }

    const insecure = [value.SEED_SUPER_ADMIN_PASSWORD, value.SEED_HR_ADMIN_PASSWORD, value.SEED_DEFAULT_PASSWORD];
    if (insecure.some((entry) => entry === 'ChangeMe@123')) {
      ctx.addIssue({
        code: 'custom',
        path: ['SEED_DEFAULT_PASSWORD'],
        message: 'Seed passwords must be changed before running in production',
      });
    }
  });

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues.map((issue) => `  - ${issue.path.join('.') || 'env'}: ${issue.message}`).join('\n');
  throw new Error(`Invalid environment configuration:\n${details}`);
}

export const env = parsed.data;

export const isProduction = env.NODE_ENV === 'production';
export const isDevelopment = env.NODE_ENV === 'development';
export const isTest = env.NODE_ENV === 'test';

export const corsOrigins: string[] =
  env.CORS_ORIGINS.length > 0 ? env.CORS_ORIGINS : isProduction ? [] : ['http://localhost:5173'];

export const allowedUploadMimeTypes: string[] = env.UPLOAD_ALLOWED_MIME_TYPES;

export type Env = typeof env;
