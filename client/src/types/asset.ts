import type { PageQuery } from './hr';

export type AssetCategory =
  | 'LAPTOP'
  | 'DESKTOP'
  | 'MONITOR'
  | 'MOBILE_PHONE'
  | 'TABLET'
  | 'SIM_CARD'
  | 'HEADSET'
  | 'PERIPHERAL'
  | 'PRINTER'
  | 'NETWORK_DEVICE'
  | 'SOFTWARE_LICENSE'
  | 'FURNITURE'
  | 'OTHER';

export type AssetStatus = 'AVAILABLE' | 'ASSIGNED' | 'IN_REPAIR' | 'RETIRED' | 'LOST';

/** ASSIGNED is set by the assign action, never chosen on the asset form. */
export type EditableAssetStatus = Exclude<AssetStatus, 'ASSIGNED'>;

export const ASSET_CATEGORIES: { value: AssetCategory; label: string }[] = [
  { value: 'LAPTOP', label: 'Laptop' },
  { value: 'DESKTOP', label: 'Desktop' },
  { value: 'MONITOR', label: 'Monitor' },
  { value: 'MOBILE_PHONE', label: 'Mobile phone' },
  { value: 'TABLET', label: 'Tablet' },
  { value: 'SIM_CARD', label: 'SIM card' },
  { value: 'HEADSET', label: 'Headset' },
  { value: 'PERIPHERAL', label: 'Peripheral' },
  { value: 'PRINTER', label: 'Printer' },
  { value: 'NETWORK_DEVICE', label: 'Network device' },
  { value: 'SOFTWARE_LICENSE', label: 'Software license' },
  { value: 'FURNITURE', label: 'Furniture' },
  { value: 'OTHER', label: 'Other' },
];

export const ASSET_STATUSES: { value: AssetStatus; label: string }[] = [
  { value: 'AVAILABLE', label: 'Available' },
  { value: 'ASSIGNED', label: 'Assigned' },
  { value: 'IN_REPAIR', label: 'In repair' },
  { value: 'RETIRED', label: 'Retired' },
  { value: 'LOST', label: 'Lost' },
];

export const EDITABLE_ASSET_STATUSES = ASSET_STATUSES.filter(
  (status) => status.value !== 'ASSIGNED',
) as { value: EditableAssetStatus; label: string }[];

export function assetCategoryLabel(category: AssetCategory): string {
  return ASSET_CATEGORIES.find((entry) => entry.value === category)?.label ?? category;
}

export interface AssetEmployeeRef {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  email: string;
  department: { id: string; name: string } | null;
}

export interface Asset {
  id: string;
  assetTag: string;
  name: string;
  category: AssetCategory;
  brand: string | null;
  model: string | null;
  serialNumber: string | null;
  status: AssetStatus;
  purchaseDate: string | null;
  purchaseCost: number | null;
  vendor: string | null;
  warrantyExpiry: string | null;
  notes: string | null;
  assignedEmployeeId: string | null;
  assignedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  assignedEmployee: AssetEmployeeRef | null;
  createdBy: { email: string } | null;
}

export interface AssetAssignment {
  id: string;
  assetId: string;
  employeeId: string;
  assignedById: string | null;
  returnedById: string | null;
  assignedAt: string;
  expectedReturnAt: string | null;
  returnedAt: string | null;
  issueCondition: string | null;
  returnCondition: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  asset: { id: string; assetTag: string; name: string; category: AssetCategory };
  employee: { id: string; employeeCode: string; firstName: string; lastName: string; email: string };
  assignedBy: { email: string } | null;
  returnedBy: { email: string } | null;
}

export interface AssetStats {
  total: number;
  available: number;
  assigned: number;
  inRepair: number;
  retired: number;
  lost: number;
  warrantyExpiring: number;
  totalValue: number;
}

export interface AssetListQuery extends PageQuery {
  category?: AssetCategory;
  status?: AssetStatus;
  assignedEmployeeId?: string;
  unassigned?: boolean;
  warrantyExpiringWithinDays?: number;
  includeDeleted?: boolean;
}

export interface AssetPayload {
  assetTag: string;
  name: string;
  category: AssetCategory;
  brand?: string;
  model?: string;
  serialNumber?: string;
  status?: EditableAssetStatus;
  purchaseDate?: string;
  purchaseCost?: number;
  vendor?: string;
  warrantyExpiry?: string;
  notes?: string;
}

export interface AssignAssetPayload {
  employeeId: string;
  expectedReturnAt?: string;
  issueCondition?: string;
  notes?: string;
}

export interface ReturnAssetPayload {
  returnCondition?: string;
  notes?: string;
  status?: EditableAssetStatus;
}
