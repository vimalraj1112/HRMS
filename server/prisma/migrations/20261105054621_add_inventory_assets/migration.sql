-- CreateEnum
CREATE TYPE "AssetCategory" AS ENUM ('LAPTOP', 'DESKTOP', 'MONITOR', 'MOBILE_PHONE', 'TABLET', 'SIM_CARD', 'HEADSET', 'PERIPHERAL', 'PRINTER', 'NETWORK_DEVICE', 'SOFTWARE_LICENSE', 'FURNITURE', 'OTHER');

-- CreateEnum
CREATE TYPE "AssetStatus" AS ENUM ('AVAILABLE', 'ASSIGNED', 'IN_REPAIR', 'RETIRED', 'LOST');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'ASSET_CREATE';
ALTER TYPE "AuditAction" ADD VALUE 'ASSET_UPDATE';
ALTER TYPE "AuditAction" ADD VALUE 'ASSET_DELETE';
ALTER TYPE "AuditAction" ADD VALUE 'ASSET_ASSIGN';
ALTER TYPE "AuditAction" ADD VALUE 'ASSET_RETURN';

-- CreateTable
CREATE TABLE "assets" (
    "id" UUID NOT NULL,
    "asset_tag" VARCHAR(40) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "category" "AssetCategory" NOT NULL,
    "brand" VARCHAR(80),
    "model" VARCHAR(120),
    "serial_number" VARCHAR(120),
    "status" "AssetStatus" NOT NULL DEFAULT 'AVAILABLE',
    "purchase_date" DATE,
    "purchase_cost" DECIMAL(12,2),
    "vendor" VARCHAR(160),
    "warranty_expiry" DATE,
    "notes" VARCHAR(1000),
    "assigned_employee_id" UUID,
    "assigned_at" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_assignments" (
    "id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "assigned_by_id" UUID,
    "returned_by_id" UUID,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expected_return_at" DATE,
    "returned_at" TIMESTAMP(3),
    "issue_condition" VARCHAR(160),
    "return_condition" VARCHAR(160),
    "notes" VARCHAR(1000),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "asset_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "assets_asset_tag_key" ON "assets"("asset_tag");

-- CreateIndex
CREATE UNIQUE INDEX "assets_serial_number_key" ON "assets"("serial_number");

-- CreateIndex
CREATE INDEX "assets_status_idx" ON "assets"("status");

-- CreateIndex
CREATE INDEX "assets_category_idx" ON "assets"("category");

-- CreateIndex
CREATE INDEX "assets_assigned_employee_id_idx" ON "assets"("assigned_employee_id");

-- CreateIndex
CREATE INDEX "assets_deleted_at_idx" ON "assets"("deleted_at");

-- CreateIndex
CREATE INDEX "asset_assignments_asset_id_returned_at_idx" ON "asset_assignments"("asset_id", "returned_at");

-- CreateIndex
CREATE INDEX "asset_assignments_employee_id_returned_at_idx" ON "asset_assignments"("employee_id", "returned_at");

-- CreateIndex
CREATE INDEX "asset_assignments_returned_at_idx" ON "asset_assignments"("returned_at");

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_assigned_employee_id_fkey" FOREIGN KEY ("assigned_employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_assignments" ADD CONSTRAINT "asset_assignments_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_assignments" ADD CONSTRAINT "asset_assignments_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_assignments" ADD CONSTRAINT "asset_assignments_assigned_by_id_fkey" FOREIGN KEY ("assigned_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_assignments" ADD CONSTRAINT "asset_assignments_returned_by_id_fkey" FOREIGN KEY ("returned_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
