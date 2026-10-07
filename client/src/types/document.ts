import type { PageQuery } from './hr';

export type DocumentType =
  | 'AADHAAR'
  | 'PAN'
  | 'PASSPORT'
  | 'OFFER_LETTER'
  | 'EXPERIENCE_LETTER'
  | 'EDUCATION_CERTIFICATE'
  | 'BANK_DOCUMENT'
  | 'ADDRESS_PROOF'
  | 'OTHER';

export const DOCUMENT_TYPES: { value: DocumentType; label: string }[] = [
  { value: 'AADHAAR', label: 'Aadhaar' },
  { value: 'PAN', label: 'PAN' },
  { value: 'PASSPORT', label: 'Passport' },
  { value: 'OFFER_LETTER', label: 'Offer Letter' },
  { value: 'EXPERIENCE_LETTER', label: 'Experience Letter' },
  { value: 'EDUCATION_CERTIFICATE', label: 'Education Certificate' },
  { value: 'BANK_DOCUMENT', label: 'Bank Document' },
  { value: 'ADDRESS_PROOF', label: 'Address Proof' },
  { value: 'OTHER', label: 'Other' },
];

export interface DocumentEmployee {
  id: string;
  employeeCode: string | null;
  firstName: string;
  lastName: string;
  department: { id: string; name: string } | null;
}

export interface EmployeeDocument {
  id: string;
  employeeId: string;
  type: DocumentType;
  title: string;
  fileName: string;
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
  uploadedById: string | null;
  uploadedAt: string;
  expiresAt: string | null;
  isVerified: boolean;
  verifiedById: string | null;
  verifiedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  employee: DocumentEmployee;
  uploadedBy: { email: string } | null;
  verifiedBy: { email: string } | null;
}

export interface DocumentListQuery extends PageQuery {
  employeeId?: string;
  type?: DocumentType;
  isVerified?: boolean;
  expiringWithinDays?: number;
}

export interface UploadDocumentPayload {
  type: DocumentType;
  title: string;
  employeeId?: string;
  expiresAt?: string;
  file: File;
}
