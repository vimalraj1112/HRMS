import { AuditAction, Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { recordAudit, type RequestMeta } from '../../services/audit.service';
import { ApiError } from '../../utils/ApiError';
import { buildPaginationMeta } from '../../utils/apiResponse';
import { addUtcDays, startOfUtcDay, toDateInputValue, toUtcDate } from '../../utils/workdays';
import { notifyEmployee } from '../notifications/notifications.service';
import type {
  AssignAssetBody,
  CreateAssetBody,
  ListAssetsQuery,
  MyAssetsQuery,
  ReturnAssetBody,
  UpdateAssetBody,
} from './assets.validator';

/** UUID that can never match, used to return an empty list for unlinked accounts. */
const NO_MATCH_ID = '00000000-0000-0000-0000-000000000000';

const ASSET_SELECT = {
  id: true,
  assetTag: true,
  name: true,
  category: true,
  brand: true,
  model: true,
  serialNumber: true,
  status: true,
  purchaseDate: true,
  purchaseCost: true,
  vendor: true,
  warrantyExpiry: true,
  notes: true,
  assignedEmployeeId: true,
  assignedAt: true,
  deletedAt: true,
  createdAt: true,
  updatedAt: true,
  assignedEmployee: {
    select: {
      id: true,
      employeeCode: true,
      firstName: true,
      lastName: true,
      email: true,
      department: { select: { id: true, name: true } },
    },
  },
  createdBy: { select: { email: true } },
} as const;

const ASSIGNMENT_SELECT = {
  id: true,
  assetId: true,
  employeeId: true,
  assignedById: true,
  returnedById: true,
  assignedAt: true,
  expectedReturnAt: true,
  returnedAt: true,
  issueCondition: true,
  returnCondition: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
  asset: { select: { id: true, assetTag: true, name: true, category: true } },
  employee: { select: { id: true, employeeCode: true, firstName: true, lastName: true, email: true } },
  assignedBy: { select: { email: true } },
  returnedBy: { select: { email: true } },
} as const;

type AssetRecord = Prisma.AssetGetPayload<{ select: typeof ASSET_SELECT }>;
type AssignmentRecord = Prisma.AssetAssignmentGetPayload<{ select: typeof ASSIGNMENT_SELECT }>;

export type Actor = { id: string; email: string; role: string; employeeId: string | null };
export type AssetScope = { readAll: boolean; employeeId: string | null };

const SORT_FIELDS = {
  assetTag: 'assetTag',
  name: 'name',
  category: 'category',
  status: 'status',
  purchaseDate: 'purchaseDate',
  warrantyExpiry: 'warrantyExpiry',
  createdAt: 'createdAt',
} as const;

function serializeAsset(asset: AssetRecord) {
  return {
    ...asset,
    purchaseCost: asset.purchaseCost === null ? null : Number(asset.purchaseCost),
    purchaseDate: asset.purchaseDate ? toDateInputValue(asset.purchaseDate) : null,
    warrantyExpiry: asset.warrantyExpiry ? toDateInputValue(asset.warrantyExpiry) : null,
    assignedAt: asset.assignedAt ? asset.assignedAt.toISOString() : null,
    deletedAt: asset.deletedAt ? asset.deletedAt.toISOString() : null,
    createdAt: asset.createdAt.toISOString(),
    updatedAt: asset.updatedAt.toISOString(),
  };
}

function serializeAssignment(assignment: AssignmentRecord) {
  return {
    ...assignment,
    expectedReturnAt: assignment.expectedReturnAt ? toDateInputValue(assignment.expectedReturnAt) : null,
    assignedAt: assignment.assignedAt.toISOString(),
    returnedAt: assignment.returnedAt ? assignment.returnedAt.toISOString() : null,
    createdAt: assignment.createdAt.toISOString(),
    updatedAt: assignment.updatedAt.toISOString(),
  };
}

/** Blank form fields arrive as empty strings; they must be stored as null. */
function textOrNull(value: string | undefined): string | null {
  if (value === undefined) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function scopeWhere(scope: AssetScope): Prisma.AssetWhereInput {
  if (scope.readAll) return {};
  return { assignedEmployeeId: scope.employeeId ?? NO_MATCH_ID };
}

function uniqueFields(body: { assetTag?: string; serialNumber?: string }) {
  const errors: { field: string; message: string }[] = [];
  if (body.serialNumber !== undefined) {
    errors.push({ field: 'serialNumber', message: 'Serial number is already registered' });
  }
  if (body.assetTag !== undefined) {
    errors.push({ field: 'assetTag', message: 'Asset tag is already in use' });
  }
  return errors;
}

function rethrowUniqueError(error: unknown, body: { assetTag?: string; serialNumber?: string }): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    const meta = error.meta as { target?: unknown } | undefined;
    const rawTarget = meta?.target;
    const target = Array.isArray(rawTarget)
      ? rawTarget.map(String).join(',')
      : typeof rawTarget === 'string'
        ? rawTarget
        : '';
    const errors: { field: string; message: string }[] = [];

    if (target.includes('asset_tag')) {
      errors.push({ field: 'assetTag', message: 'Asset tag is already in use' });
    }
    if (target.includes('serial_number')) {
      errors.push({ field: 'serialNumber', message: 'Serial number is already registered' });
    }

    throw ApiError.conflict('An asset with these details already exists', errors.length > 0 ? errors : uniqueFields(body));
  }
  throw error;
}

export async function listAssets(query: ListAssetsQuery, scope: AssetScope) {
  const where: Prisma.AssetWhereInput = {
    ...scopeWhere(scope),
    ...(query.includeDeleted ? {} : { deletedAt: null }),
    ...(query.category ? { category: query.category } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.assignedEmployeeId ? { assignedEmployeeId: query.assignedEmployeeId } : {}),
    ...(query.unassigned ? { assignedEmployeeId: null } : {}),
    ...(query.search
      ? {
          OR: [
            { assetTag: { contains: query.search, mode: 'insensitive' } },
            { name: { contains: query.search, mode: 'insensitive' } },
            { serialNumber: { contains: query.search, mode: 'insensitive' } },
            { brand: { contains: query.search, mode: 'insensitive' } },
            { model: { contains: query.search, mode: 'insensitive' } },
          ],
        }
      : {}),
    ...(query.warrantyExpiringWithinDays === undefined
      ? {}
      : {
          warrantyExpiry: {
            not: null,
            gte: startOfUtcDay(new Date()),
            lte: addUtcDays(startOfUtcDay(new Date()), query.warrantyExpiringWithinDays),
          },
        }),
  };

  const sortField = SORT_FIELDS[query.sortBy as keyof typeof SORT_FIELDS] ?? 'createdAt';

  const [items, total] = await Promise.all([
    prisma.asset.findMany({
      where,
      select: ASSET_SELECT,
      orderBy: [{ [sortField]: query.sortOrder }, { assetTag: 'asc' }],
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.asset.count({ where }),
  ]);

  return {
    items: items.map(serializeAsset),
    meta: buildPaginationMeta(query.page, query.limit, total),
  };
}

async function findAssetOrThrow(id: string) {
  const asset = await prisma.asset.findUnique({ where: { id }, select: ASSET_SELECT });
  if (!asset || asset.deletedAt) throw ApiError.notFound('Asset not found');
  return asset;
}

export async function getAsset(id: string, scope: AssetScope) {
  const asset = await findAssetOrThrow(id);
  if (!scope.readAll && asset.assignedEmployeeId !== scope.employeeId) {
    throw ApiError.forbidden('You are not allowed to access this asset');
  }
  return serializeAsset(asset);
}

export async function getAssetHistory(id: string) {
  await findAssetOrThrow(id);
  const items = await prisma.assetAssignment.findMany({
    where: { assetId: id },
    select: ASSIGNMENT_SELECT,
    orderBy: { assignedAt: 'desc' },
  });
  return items.map(serializeAssignment);
}

/** Assignments made to the signed in employee, newest first, including returned ones. */
export async function listMyAssetHistory(employeeId: string | null, query: MyAssetsQuery) {
  if (!employeeId) {
    return { items: [], meta: buildPaginationMeta(query.page, query.limit, 0) };
  }

  const [items, total] = await Promise.all([
    prisma.assetAssignment.findMany({
      where: { employeeId },
      select: ASSIGNMENT_SELECT,
      orderBy: [{ returnedAt: 'asc' }, { assignedAt: 'desc' }],
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.assetAssignment.count({ where: { employeeId } }),
  ]);

  return { items: items.map(serializeAssignment), meta: buildPaginationMeta(query.page, query.limit, total) };
}

export async function getAssetStats(scope: AssetScope) {
  const base: Prisma.AssetWhereInput = { ...scopeWhere(scope), deletedAt: null };
  const today = startOfUtcDay(new Date());

  const [groups, value, warrantyExpiring] = await Promise.all([
    prisma.asset.groupBy({ by: ['status'], where: base, _count: { _all: true } }),
    prisma.asset.aggregate({ where: base, _sum: { purchaseCost: true } }),
    prisma.asset.count({
      where: { ...base, warrantyExpiry: { not: null, gte: today, lte: addUtcDays(today, 30) } },
    }),
  ]);

  const byStatus = Object.fromEntries(groups.map((group) => [group.status, group._count._all]));

  return {
    total: groups.reduce((sum, group) => sum + group._count._all, 0),
    available: byStatus.AVAILABLE ?? 0,
    assigned: byStatus.ASSIGNED ?? 0,
    inRepair: byStatus.IN_REPAIR ?? 0,
    retired: byStatus.RETIRED ?? 0,
    lost: byStatus.LOST ?? 0,
    warrantyExpiring,
    totalValue: Number(value._sum.purchaseCost ?? 0),
  };
}

export async function createAsset(body: CreateAssetBody, actor: Actor, meta: RequestMeta) {
  const asset = await prisma.asset
    .create({
      data: {
        assetTag: body.assetTag,
        name: body.name,
        category: body.category,
        brand: textOrNull(body.brand),
        model: textOrNull(body.model),
        serialNumber: textOrNull(body.serialNumber),
        status: body.status,
        ...(body.purchaseDate ? { purchaseDate: toUtcDate(body.purchaseDate) } : {}),
        ...(body.purchaseCost === undefined ? {} : { purchaseCost: body.purchaseCost }),
        vendor: textOrNull(body.vendor),
        ...(body.warrantyExpiry ? { warrantyExpiry: toUtcDate(body.warrantyExpiry) } : {}),
        notes: textOrNull(body.notes),
        createdById: actor.id,
      },
      select: ASSET_SELECT,
    })
    .catch((error: unknown) => rethrowUniqueError(error, body));

  await recordAudit({
    userId: actor.id,
    userEmail: actor.email,
    action: AuditAction.ASSET_CREATE,
    entity: 'Asset',
    entityId: asset.id,
    meta,
    newValue: { assetTag: asset.assetTag, name: asset.name, category: asset.category },
  });

  return serializeAsset(asset);
}

export async function updateAsset(id: string, body: UpdateAssetBody, actor: Actor, meta: RequestMeta) {
  const existing = await findAssetOrThrow(id);

  if (existing.assignedEmployeeId && body.status !== undefined) {
    throw ApiError.unprocessable('Return the asset from the current holder before changing its status');
  }

  const asset = await prisma.asset
    .update({
      where: { id },
      data: {
        ...(body.assetTag === undefined ? {} : { assetTag: body.assetTag }),
        ...(body.name === undefined ? {} : { name: body.name }),
        ...(body.category === undefined ? {} : { category: body.category }),
        ...(body.brand === undefined ? {} : { brand: textOrNull(body.brand) }),
        ...(body.model === undefined ? {} : { model: textOrNull(body.model) }),
        ...(body.serialNumber === undefined ? {} : { serialNumber: textOrNull(body.serialNumber) }),
        ...(body.status === undefined ? {} : { status: body.status }),
        ...(body.purchaseDate === undefined
          ? {}
          : { purchaseDate: body.purchaseDate === null ? null : toUtcDate(body.purchaseDate) }),
        ...(body.purchaseCost === undefined ? {} : { purchaseCost: body.purchaseCost }),
        ...(body.vendor === undefined ? {} : { vendor: textOrNull(body.vendor) }),
        ...(body.warrantyExpiry === undefined
          ? {}
          : { warrantyExpiry: body.warrantyExpiry === null ? null : toUtcDate(body.warrantyExpiry) }),
        ...(body.notes === undefined ? {} : { notes: textOrNull(body.notes) }),
      },
      select: ASSET_SELECT,
    })
    .catch((error: unknown) => rethrowUniqueError(error, body));

  await recordAudit({
    userId: actor.id,
    userEmail: actor.email,
    action: AuditAction.ASSET_UPDATE,
    entity: 'Asset',
    entityId: id,
    meta,
    oldValue: {
      assetTag: existing.assetTag,
      name: existing.name,
      category: existing.category,
      status: existing.status,
    },
    newValue: { assetTag: asset.assetTag, name: asset.name, category: asset.category, status: asset.status },
  });

  return serializeAsset(asset);
}

export async function deleteAsset(id: string, actor: Actor, meta: RequestMeta) {
  const existing = await findAssetOrThrow(id);

  if (existing.assignedEmployeeId) {
    throw ApiError.conflict('Return the asset from the current holder before deleting it');
  }

  await prisma.asset.update({ where: { id }, data: { deletedAt: new Date() } });

  await recordAudit({
    userId: actor.id,
    userEmail: actor.email,
    action: AuditAction.ASSET_DELETE,
    entity: 'Asset',
    entityId: id,
    meta,
    oldValue: { assetTag: existing.assetTag, name: existing.name, status: existing.status },
  });

  return { id };
}

export async function assignAsset(id: string, body: AssignAssetBody, actor: Actor, meta: RequestMeta) {
  const employee = await prisma.employee.findUnique({
    where: { id: body.employeeId },
    select: { id: true, firstName: true, lastName: true, status: true },
  });
  if (!employee) throw ApiError.notFound('Employee record not found');
  if (employee.status === 'TERMINATED' || employee.status === 'RESIGNED') {
    throw ApiError.unprocessable('Assets cannot be assigned to an inactive employee');
  }

  const asset = await prisma.$transaction(async (tx) => {
    const current = await tx.asset.findUnique({ where: { id }, select: ASSET_SELECT });
    if (!current || current.deletedAt) throw ApiError.notFound('Asset not found');
    if (current.status === 'RETIRED' || current.status === 'LOST') {
      throw ApiError.unprocessable(`A ${current.status.toLowerCase()} asset cannot be assigned`);
    }
    if (current.assignedEmployeeId) {
      throw ApiError.conflict('This asset is already assigned. Return it before reassigning.');
    }

    // Conditional claim: two concurrent requests cannot both win.
    const claimed = await tx.asset.updateMany({
      where: { id, deletedAt: null, assignedEmployeeId: null },
      data: { status: 'ASSIGNED', assignedEmployeeId: body.employeeId, assignedAt: new Date() },
    });
    if (claimed.count === 0) throw ApiError.conflict('This asset is already assigned');

    await tx.assetAssignment.create({
      data: {
        assetId: id,
        employeeId: body.employeeId,
        assignedById: actor.id,
        ...(body.expectedReturnAt ? { expectedReturnAt: toUtcDate(body.expectedReturnAt) } : {}),
        issueCondition: textOrNull(body.issueCondition),
        notes: textOrNull(body.notes),
      },
    });

    return tx.asset.findUniqueOrThrow({ where: { id }, select: ASSET_SELECT });
  });

  await recordAudit({
    userId: actor.id,
    userEmail: actor.email,
    action: AuditAction.ASSET_ASSIGN,
    entity: 'Asset',
    entityId: id,
    meta,
    newValue: { employeeId: body.employeeId, assetTag: asset.assetTag },
  });

  await notifyEmployee(body.employeeId, {
    type: 'INFO',
    title: `Asset assigned: ${asset.name}`,
    message: `Asset ${asset.assetTag} has been assigned to you.`,
    link: '/inventory/my',
    entityType: 'Asset',
    entityId: id,
  });

  return serializeAsset(asset);
}

export async function returnAsset(id: string, body: ReturnAssetBody, actor: Actor, meta: RequestMeta) {
  const result = await prisma.$transaction(async (tx) => {
    const current = await tx.asset.findUnique({ where: { id }, select: ASSET_SELECT });
    if (!current || current.deletedAt) throw ApiError.notFound('Asset not found');

    const openAssignment = await tx.assetAssignment.findFirst({
      where: { assetId: id, returnedAt: null },
      select: { id: true, employeeId: true },
      orderBy: { assignedAt: 'desc' },
    });
    if (!openAssignment) throw ApiError.conflict('This asset is not currently assigned');

    const closed = await tx.assetAssignment.updateMany({
      where: { id: openAssignment.id, returnedAt: null },
      data: {
        returnedAt: new Date(),
        returnedById: actor.id,
        returnCondition: textOrNull(body.returnCondition),
        ...(body.notes === undefined ? {} : { notes: textOrNull(body.notes) }),
      },
    });
    if (closed.count === 0) throw ApiError.conflict('This asset has already been returned');

    const asset = await tx.asset.update({
      where: { id },
      data: {
        status: body.status,
        assignedEmployeeId: null,
        assignedAt: null,
      },
      select: ASSET_SELECT,
    });

    return { asset, employeeId: openAssignment.employeeId };
  });

  await recordAudit({
    userId: actor.id,
    userEmail: actor.email,
    action: AuditAction.ASSET_RETURN,
    entity: 'Asset',
    entityId: id,
    meta,
    newValue: { employeeId: result.employeeId, status: body.status, assetTag: result.asset.assetTag },
  });

  await notifyEmployee(result.employeeId, {
    type: 'SUCCESS',
    title: `Asset returned: ${result.asset.name}`,
    message: `Asset ${result.asset.assetTag} has been marked as returned.`,
    link: '/inventory/my',
    entityType: 'Asset',
    entityId: id,
  });

  return serializeAsset(result.asset);
}
