import type { AuditAction, Prisma } from '@prisma/client';
import type { Request } from 'express';
import { prisma } from '../config/prisma';
import { logger } from '../config/logger';

export interface RequestMeta {
  ip: string;
  userAgent: string;
  requestId: string | null;
}

export function getRequestMeta(req: Request): RequestMeta {
  const forwarded = req.headers['x-forwarded-for'];
  const ip =
    (typeof forwarded === 'string' ? forwarded.split(',')[0]?.trim() : undefined) ??
    req.socket.remoteAddress ??
    'unknown';

  const requestId = req.headers['x-request-id'];

  return {
    ip: ip.slice(0, 64),
    userAgent: (req.headers['user-agent'] ?? 'unknown').slice(0, 255),
    requestId: typeof requestId === 'string' ? requestId.slice(0, 64) : null,
  };
}

export interface AuditInput {
  userId?: string | null;
  userEmail?: string | null;
  action: AuditAction;
  entity: string;
  entityId?: string | null;
  oldValue?: Prisma.InputJsonValue | null;
  newValue?: Prisma.InputJsonValue | null;
  meta?: RequestMeta | null;
}

const SENSITIVE_KEYS = new Set([
  'password',
  'passwordhash',
  'newpassword',
  'currentpassword',
  'confirmpassword',
  'refreshtoken',
  'accesstoken',
  'token',
  'pan',
  'pannumber',
  'aadhaar',
  'aadharnumber',
  'bankaccountnumber',
]);

export function redactForAudit(value: unknown): Prisma.InputJsonValue | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((entry) => redactForAudit(entry) ?? null);
  if (typeof value === 'object') {
    const output: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      output[key] = SENSITIVE_KEYS.has(key.toLowerCase()) ? '[REDACTED]' : redactForAudit(entry);
    }
    return output as Prisma.InputJsonValue;
  }
  if (typeof value === 'bigint') return value.toString();
  return value;
}

export async function recordAudit(input: AuditInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: input.userId ?? null,
        userEmail: input.userEmail ?? null,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId ?? null,
        oldValue: input.oldValue ?? undefined,
        newValue: input.newValue ?? undefined,
        ipAddress: input.meta?.ip ?? null,
        userAgent: input.meta?.userAgent ?? null,
        requestId: input.meta?.requestId ?? null,
      },
    });
  } catch (error) {
    logger.error(
      { err: error instanceof Error ? error.message : String(error), action: input.action, entity: input.entity },
      'Failed to write audit log',
    );
  }
}

export function auditFromRequest(
  req: Request,
  action: AuditAction,
  entity: string,
  entityId?: string | null,
  values?: { oldValue?: unknown; newValue?: unknown },
): Promise<void> {
  return recordAudit({
    userId: req.user?.id ?? null,
    userEmail: req.user?.email ?? null,
    action,
    entity,
    entityId: entityId ?? null,
    oldValue: redactForAudit(values?.oldValue),
    newValue: redactForAudit(values?.newValue),
    meta: getRequestMeta(req),
  });
}
