-- CreateEnum
CREATE TYPE "Role" AS ENUM ('SUPER_ADMIN', 'HR_ADMIN', 'HR_MANAGER', 'MANAGER', 'FINANCE', 'RECRUITER', 'EMPLOYEE');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED', 'PENDING_ACTIVATION');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY');

-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN', 'CONSULTANT');

-- CreateEnum
CREATE TYPE "EmployeeStatus" AS ENUM ('ACTIVE', 'ON_NOTICE', 'SUSPENDED', 'RESIGNED', 'TERMINATED');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'ABSENT', 'HALF_DAY', 'LATE', 'ON_LEAVE', 'HOLIDAY', 'WEEK_OFF');

-- CreateEnum
CREATE TYPE "AttendanceSource" AS ENUM ('MANUAL', 'BIOMETRIC', 'IMPORT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "LeaveUnit" AS ENUM ('DAYS', 'HOURS');

-- CreateEnum
CREATE TYPE "LeaveRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ApprovalStage" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "HolidayType" AS ENUM ('PUBLIC', 'OPTIONAL', 'RESTRICTED');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('AADHAAR', 'PAN', 'PASSPORT', 'OFFER_LETTER', 'EXPERIENCE_LETTER', 'EDUCATION_CERTIFICATE', 'BANK_DOCUMENT', 'ADDRESS_PROOF', 'OTHER');

-- CreateEnum
CREATE TYPE "SalaryComponent" AS ENUM ('BASIC', 'HRA', 'TRANSPORT_ALLOWANCE', 'MEDICAL_ALLOWANCE', 'OTHER_ALLOWANCE', 'PF', 'ESI', 'PROFESSIONAL_TAX', 'TDS', 'OTHER_DEDUCTION');

-- CreateEnum
CREATE TYPE "PayrollStatus" AS ENUM ('DRAFT', 'PROCESSED', 'LOCKED');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('DRAFT', 'OPEN', 'ON_HOLD', 'CLOSED');

-- CreateEnum
CREATE TYPE "CandidateStatus" AS ENUM ('APPLIED', 'SCREENING', 'INTERVIEW', 'SELECTED', 'REJECTED', 'OFFERED', 'HIRED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "InterviewMode" AS ENUM ('ONSITE', 'PHONE', 'VIDEO');

-- CreateEnum
CREATE TYPE "InterviewStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'CANCELLED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "InterviewRecommendation" AS ENUM ('STRONG_HIRE', 'HIRE', 'NO_HIRE', 'STRONG_NO_HIRE');

-- CreateEnum
CREATE TYPE "OfferStatus" AS ENUM ('DRAFT', 'EXTENDED', 'ACCEPTED', 'REJECTED', 'WITHDRAWN', 'EXPIRED');

-- CreateEnum
CREATE TYPE "GoalType" AS ENUM ('KPI', 'DEVELOPMENT', 'PROJECT');

-- CreateEnum
CREATE TYPE "GoalStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ReviewPeriod" AS ENUM ('QUARTERLY', 'HALF_YEARLY', 'ANNUAL');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'ACKNOWLEDGED');

-- CreateEnum
CREATE TYPE "AnnouncementAudience" AS ENUM ('ALL', 'DEPARTMENT', 'DESIGNATION', 'ROLE', 'EMPLOYEE');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('INFO', 'SUCCESS', 'WARNING', 'ERROR');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('LOGIN', 'LOGIN_FAILED', 'LOGOUT', 'TOKEN_REFRESH', 'PASSWORD_CHANGE', 'PASSWORD_RESET', 'EMPLOYEE_CREATE', 'EMPLOYEE_UPDATE', 'EMPLOYEE_STATUS_CHANGE', 'EMPLOYEE_DELETE', 'USER_CREATE', 'USER_UPDATE', 'ROLE_CHANGE', 'DEPARTMENT_CREATE', 'DEPARTMENT_UPDATE', 'DEPARTMENT_DELETE', 'DESIGNATION_CREATE', 'DESIGNATION_UPDATE', 'DESIGNATION_DELETE', 'ATTENDANCE_CREATE', 'ATTENDANCE_UPDATE', 'ATTENDANCE_CORRECTION', 'ATTENDANCE_IMPORT', 'ATTENDANCE_DELETE', 'LEAVE_APPLY', 'LEAVE_APPROVE', 'LEAVE_REJECT', 'LEAVE_CANCEL', 'LEAVE_TYPE_CREATE', 'LEAVE_TYPE_UPDATE', 'LEAVE_TYPE_DELETE', 'HOLIDAY_CREATE', 'HOLIDAY_UPDATE', 'HOLIDAY_DELETE', 'SALARY_CREATE', 'SALARY_UPDATE', 'PAYROLL_PROCESS', 'PAYROLL_LOCK', 'PAYSLIP_DOWNLOAD', 'DOCUMENT_UPLOAD', 'DOCUMENT_UPDATE', 'DOCUMENT_DELETE', 'DOCUMENT_DOWNLOAD', 'JOB_CREATE', 'JOB_UPDATE', 'JOB_DELETE', 'CANDIDATE_CREATE', 'CANDIDATE_UPDATE', 'CANDIDATE_STATUS_CHANGE', 'INTERVIEW_CREATE', 'INTERVIEW_UPDATE', 'INTERVIEW_FEEDBACK', 'OFFER_CREATE', 'OFFER_UPDATE', 'OFFER_STATUS_CHANGE', 'GOAL_CREATE', 'GOAL_UPDATE', 'GOAL_DELETE', 'PERFORMANCE_REVIEW_CREATE', 'PERFORMANCE_REVIEW_UPDATE', 'PERFORMANCE_REVIEW_SUBMIT', 'ANNOUNCEMENT_CREATE', 'ANNOUNCEMENT_UPDATE', 'ANNOUNCEMENT_DELETE', 'SETTINGS_UPDATE', 'REPORT_EXPORT');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" VARCHAR(160) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'EMPLOYEE',
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "employee_id" UUID,
    "last_login_at" TIMESTAMP(3),
    "failed_login_attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMP(3),
    "password_changed_at" TIMESTAMP(3),
    "must_change_password" BOOLEAN NOT NULL DEFAULT false,
    "token_version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" VARCHAR(128) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "ip_address" VARCHAR(64),
    "user_agent" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "departments" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "description" TEXT,
    "head_id" UUID,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "designations" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "level" INTEGER,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "designations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employees" (
    "id" UUID NOT NULL,
    "employee_code" VARCHAR(20) NOT NULL,
    "first_name" VARCHAR(80) NOT NULL,
    "middle_name" VARCHAR(80),
    "last_name" VARCHAR(80) NOT NULL,
    "email" VARCHAR(160) NOT NULL,
    "phone" VARCHAR(25),
    "gender" "Gender",
    "date_of_birth" DATE,
    "profile_photo_url" TEXT,
    "address" VARCHAR(255),
    "city" VARCHAR(80),
    "state" VARCHAR(80),
    "postal_code" VARCHAR(20),
    "country" VARCHAR(80) NOT NULL DEFAULT 'India',
    "emergency_contact_name" VARCHAR(120),
    "emergency_contact_phone" VARCHAR(25),
    "joining_date" DATE NOT NULL,
    "exit_date" DATE,
    "employment_type" "EmploymentType" NOT NULL DEFAULT 'FULL_TIME',
    "status" "EmployeeStatus" NOT NULL DEFAULT 'ACTIVE',
    "department_id" UUID,
    "designation_id" UUID,
    "manager_id" UUID,
    "pan_number" VARCHAR(20),
    "aadhaar_number" VARCHAR(20),
    "bank_name" VARCHAR(120),
    "bank_account_number" VARCHAR(40),
    "bank_ifsc" VARCHAR(20),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "check_in" TIMESTAMP(3),
    "check_out" TIMESTAMP(3),
    "total_minutes" INTEGER,
    "status" "AttendanceStatus" NOT NULL DEFAULT 'PRESENT',
    "source" "AttendanceSource" NOT NULL DEFAULT 'MANUAL',
    "work_from" VARCHAR(120),
    "work_to" VARCHAR(120),
    "ip_address" VARCHAR(64),
    "notes" VARCHAR(255),
    "is_corrected" BOOLEAN NOT NULL DEFAULT false,
    "corrected_by_id" UUID,
    "corrected_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_types" (
    "id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "description" TEXT,
    "unit" "LeaveUnit" NOT NULL DEFAULT 'DAYS',
    "annual_quota" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "is_paid" BOOLEAN NOT NULL DEFAULT true,
    "allows_carry_forward" BOOLEAN NOT NULL DEFAULT false,
    "max_carry_forward" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "requires_document" BOOLEAN NOT NULL DEFAULT false,
    "min_days_notice" INTEGER NOT NULL DEFAULT 0,
    "color" VARCHAR(20),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leave_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_balances" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "leave_type_id" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "allocated" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "used" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "pending" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "carried_forward" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leave_balances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_requests" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "leave_type_id" UUID NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "total_days" DECIMAL(6,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "contact_during_leave" VARCHAR(25),
    "document_key" TEXT,
    "status" "LeaveRequestStatus" NOT NULL DEFAULT 'PENDING',
    "applied_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelled_at" TIMESTAMP(3),
    "cancellation_reason" VARCHAR(255),
    "manager_id" UUID,
    "manager_stage" "ApprovalStage" NOT NULL DEFAULT 'PENDING',
    "manager_remark" TEXT,
    "manager_action_at" TIMESTAMP(3),
    "manager_action_by_id" UUID,
    "hr_approver_id" UUID,
    "hr_stage" "ApprovalStage" NOT NULL DEFAULT 'PENDING',
    "hr_remark" TEXT,
    "hr_action_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leave_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "holidays" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "date" DATE NOT NULL,
    "type" "HolidayType" NOT NULL DEFAULT 'PUBLIC',
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "holidays_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_documents" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "type" "DocumentType" NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "file_name" VARCHAR(255) NOT NULL,
    "storage_key" VARCHAR(512) NOT NULL,
    "mime_type" VARCHAR(120) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "uploaded_by_id" UUID,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" DATE,
    "is_verified" BOOLEAN NOT NULL DEFAULT false,
    "verified_by_id" UUID,
    "verified_at" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "salary_structures" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "effective_from" DATE NOT NULL,
    "effective_to" DATE,
    "basic_salary" DECIMAL(12,2) NOT NULL,
    "hra" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "transport_allowance" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "medical_allowance" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "other_allowance" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "gross_salary" DECIMAL(12,2) NOT NULL,
    "pf" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "esi" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "professional_tax" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "tds" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "other_deduction" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "net_salary" DECIMAL(12,2) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "salary_structures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_runs" (
    "id" UUID NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "status" "PayrollStatus" NOT NULL DEFAULT 'DRAFT',
    "employee_count" INTEGER NOT NULL DEFAULT 0,
    "total_gross_salary" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total_deductions" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total_net_salary" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "processed_by_id" UUID,
    "processed_at" TIMESTAMP(3),
    "locked_at" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payslips" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "payroll_run_id" UUID,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "basic_salary" DECIMAL(12,2) NOT NULL,
    "hra" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "transport_allowance" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "medical_allowance" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "other_allowance" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "gross_salary" DECIMAL(12,2) NOT NULL,
    "pf" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "esi" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "professional_tax" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "tds" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "other_deduction" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total_deductions" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "net_salary" DECIMAL(12,2) NOT NULL,
    "working_days" INTEGER NOT NULL DEFAULT 0,
    "days_present" INTEGER NOT NULL DEFAULT 0,
    "days_absent" INTEGER NOT NULL DEFAULT 0,
    "days_paid_leave" INTEGER NOT NULL DEFAULT 0,
    "lop_days" INTEGER NOT NULL DEFAULT 0,
    "status" "PayrollStatus" NOT NULL DEFAULT 'DRAFT',
    "generated_by_id" UUID,
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "locked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payslips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_openings" (
    "id" UUID NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "department_id" UUID,
    "designation_id" UUID,
    "hiring_manager_id" UUID,
    "location" VARCHAR(120),
    "employment_type" "EmploymentType" NOT NULL DEFAULT 'FULL_TIME',
    "openings_count" INTEGER NOT NULL DEFAULT 1,
    "description" TEXT NOT NULL,
    "requirements" TEXT,
    "min_experience" INTEGER,
    "max_experience" INTEGER,
    "salary_min" DECIMAL(12,2),
    "salary_max" DECIMAL(12,2),
    "status" "JobStatus" NOT NULL DEFAULT 'DRAFT',
    "published_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_openings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidates" (
    "id" UUID NOT NULL,
    "job_opening_id" UUID,
    "first_name" VARCHAR(80) NOT NULL,
    "last_name" VARCHAR(80) NOT NULL,
    "email" VARCHAR(160) NOT NULL,
    "phone" VARCHAR(25),
    "current_company" VARCHAR(120),
    "current_designation" VARCHAR(120),
    "experience_years" DECIMAL(4,1),
    "expected_salary" DECIMAL(12,2),
    "resume_key" VARCHAR(512),
    "resume_file_name" VARCHAR(255),
    "source" VARCHAR(120),
    "status" "CandidateStatus" NOT NULL DEFAULT 'APPLIED',
    "stage_order" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "rejection_reason" TEXT,
    "hired_employee_id" UUID,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "candidates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interviews" (
    "id" UUID NOT NULL,
    "candidate_id" UUID NOT NULL,
    "interviewer_id" UUID NOT NULL,
    "round" INTEGER NOT NULL DEFAULT 1,
    "scheduled_at" TIMESTAMP(3) NOT NULL,
    "duration_minutes" INTEGER NOT NULL DEFAULT 60,
    "mode" "InterviewMode" NOT NULL DEFAULT 'ONSITE',
    "location_or_link" VARCHAR(255),
    "status" "InterviewStatus" NOT NULL DEFAULT 'SCHEDULED',
    "rating" INTEGER,
    "recommendation" "InterviewRecommendation",
    "strengths" TEXT,
    "improvements" TEXT,
    "feedback" TEXT,
    "feedback_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "interviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offers" (
    "id" UUID NOT NULL,
    "candidate_id" UUID NOT NULL,
    "job_opening_id" UUID,
    "employee_id" UUID,
    "department_id" UUID,
    "designation_id" UUID,
    "annual_ctc" DECIMAL(12,2) NOT NULL,
    "joining_date" DATE,
    "status" "OfferStatus" NOT NULL DEFAULT 'DRAFT',
    "issued_at" TIMESTAMP(3),
    "responded_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "document_key" VARCHAR(512),
    "notes" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "offers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goals" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "type" "GoalType" NOT NULL DEFAULT 'KPI',
    "status" "GoalStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "weight" INTEGER NOT NULL DEFAULT 0,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "start_date" DATE,
    "due_date" DATE,
    "completed_at" TIMESTAMP(3),
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "goals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "key_performance_indicators" (
    "id" UUID NOT NULL,
    "goal_id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "target_value" DECIMAL(12,2) NOT NULL,
    "current_value" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "unit" VARCHAR(40),
    "weight" INTEGER NOT NULL DEFAULT 0,
    "achieved" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "key_performance_indicators_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "performance_reviews" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "reviewer_id" UUID NOT NULL,
    "period" "ReviewPeriod" NOT NULL DEFAULT 'QUARTERLY',
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "self_rating" DECIMAL(3,2),
    "manager_rating" DECIMAL(3,2),
    "overall_rating" DECIMAL(3,2),
    "status" "ReviewStatus" NOT NULL DEFAULT 'DRAFT',
    "achievements" TEXT,
    "strengths" TEXT,
    "improvements" TEXT,
    "manager_comments" TEXT,
    "employee_comments" TEXT,
    "submitted_at" TIMESTAMP(3),
    "acknowledged_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "performance_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "announcements" (
    "id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "content" TEXT NOT NULL,
    "audience" "AnnouncementAudience" NOT NULL DEFAULT 'ALL',
    "department_id" UUID,
    "designation_id" UUID,
    "role" "Role",
    "employee_id" UUID,
    "is_pinned" BOOLEAN NOT NULL DEFAULT false,
    "published_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3),
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "announcements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "announcement_reads" (
    "id" UUID NOT NULL,
    "announcement_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "read_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "announcement_reads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "employee_id" UUID,
    "type" "NotificationType" NOT NULL DEFAULT 'INFO',
    "title" VARCHAR(160) NOT NULL,
    "message" TEXT NOT NULL,
    "link" VARCHAR(255),
    "entity_type" VARCHAR(60),
    "entity_id" VARCHAR(60),
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "user_email" VARCHAR(160),
    "action" "AuditAction" NOT NULL,
    "entity" VARCHAR(60) NOT NULL,
    "entity_id" VARCHAR(60),
    "old_value" JSONB,
    "new_value" JSONB,
    "ip_address" VARCHAR(64),
    "user_agent" VARCHAR(255),
    "request_id" VARCHAR(64),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_settings" (
    "id" UUID NOT NULL,
    "key" VARCHAR(80) NOT NULL,
    "value" JSONB NOT NULL,
    "description" VARCHAR(255),
    "updated_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_employee_id_key" ON "users"("employee_id");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE INDEX "users_status_idx" ON "users"("status");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_expires_at_idx" ON "refresh_tokens"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "departments_name_key" ON "departments"("name");

-- CreateIndex
CREATE UNIQUE INDEX "departments_code_key" ON "departments"("code");

-- CreateIndex
CREATE INDEX "departments_is_active_idx" ON "departments"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "designations_name_key" ON "designations"("name");

-- CreateIndex
CREATE UNIQUE INDEX "designations_code_key" ON "designations"("code");

-- CreateIndex
CREATE INDEX "designations_is_active_idx" ON "designations"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "employees_employee_code_key" ON "employees"("employee_code");

-- CreateIndex
CREATE UNIQUE INDEX "employees_email_key" ON "employees"("email");

-- CreateIndex
CREATE INDEX "employees_department_id_idx" ON "employees"("department_id");

-- CreateIndex
CREATE INDEX "employees_designation_id_idx" ON "employees"("designation_id");

-- CreateIndex
CREATE INDEX "employees_manager_id_idx" ON "employees"("manager_id");

-- CreateIndex
CREATE INDEX "employees_status_idx" ON "employees"("status");

-- CreateIndex
CREATE INDEX "employees_joining_date_idx" ON "employees"("joining_date");

-- CreateIndex
CREATE INDEX "employees_last_name_first_name_idx" ON "employees"("last_name", "first_name");

-- CreateIndex
CREATE INDEX "attendance_date_status_idx" ON "attendance"("date", "status");

-- CreateIndex
CREATE INDEX "attendance_employee_id_date_idx" ON "attendance"("employee_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_employee_id_date_key" ON "attendance"("employee_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "leave_types_name_key" ON "leave_types"("name");

-- CreateIndex
CREATE UNIQUE INDEX "leave_types_code_key" ON "leave_types"("code");

-- CreateIndex
CREATE INDEX "leave_types_is_active_idx" ON "leave_types"("is_active");

-- CreateIndex
CREATE INDEX "leave_balances_employee_id_year_idx" ON "leave_balances"("employee_id", "year");

-- CreateIndex
CREATE UNIQUE INDEX "leave_balances_employee_id_leave_type_id_year_key" ON "leave_balances"("employee_id", "leave_type_id", "year");

-- CreateIndex
CREATE INDEX "leave_requests_employee_id_status_idx" ON "leave_requests"("employee_id", "status");

-- CreateIndex
CREATE INDEX "leave_requests_status_start_date_idx" ON "leave_requests"("status", "start_date");

-- CreateIndex
CREATE INDEX "leave_requests_manager_id_manager_stage_idx" ON "leave_requests"("manager_id", "manager_stage");

-- CreateIndex
CREATE INDEX "holidays_date_idx" ON "holidays"("date");

-- CreateIndex
CREATE INDEX "holidays_is_active_idx" ON "holidays"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "holidays_name_date_key" ON "holidays"("name", "date");

-- CreateIndex
CREATE INDEX "employee_documents_employee_id_type_idx" ON "employee_documents"("employee_id", "type");

-- CreateIndex
CREATE INDEX "employee_documents_deleted_at_idx" ON "employee_documents"("deleted_at");

-- CreateIndex
CREATE INDEX "salary_structures_employee_id_effective_from_idx" ON "salary_structures"("employee_id", "effective_from");

-- CreateIndex
CREATE INDEX "salary_structures_is_active_idx" ON "salary_structures"("is_active");

-- CreateIndex
CREATE INDEX "payroll_runs_status_idx" ON "payroll_runs"("status");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_runs_month_year_key" ON "payroll_runs"("month", "year");

-- CreateIndex
CREATE INDEX "payslips_month_year_idx" ON "payslips"("month", "year");

-- CreateIndex
CREATE INDEX "payslips_status_idx" ON "payslips"("status");

-- CreateIndex
CREATE UNIQUE INDEX "payslips_employee_id_month_year_key" ON "payslips"("employee_id", "month", "year");

-- CreateIndex
CREATE INDEX "job_openings_status_idx" ON "job_openings"("status");

-- CreateIndex
CREATE INDEX "job_openings_department_id_idx" ON "job_openings"("department_id");

-- CreateIndex
CREATE UNIQUE INDEX "candidates_email_key" ON "candidates"("email");

-- CreateIndex
CREATE INDEX "candidates_status_idx" ON "candidates"("status");

-- CreateIndex
CREATE INDEX "candidates_job_opening_id_status_idx" ON "candidates"("job_opening_id", "status");

-- CreateIndex
CREATE INDEX "interviews_candidate_id_round_idx" ON "interviews"("candidate_id", "round");

-- CreateIndex
CREATE INDEX "interviews_interviewer_id_scheduled_at_idx" ON "interviews"("interviewer_id", "scheduled_at");

-- CreateIndex
CREATE INDEX "interviews_status_idx" ON "interviews"("status");

-- CreateIndex
CREATE INDEX "offers_status_idx" ON "offers"("status");

-- CreateIndex
CREATE INDEX "offers_candidate_id_idx" ON "offers"("candidate_id");

-- CreateIndex
CREATE INDEX "goals_employee_id_status_idx" ON "goals"("employee_id", "status");

-- CreateIndex
CREATE INDEX "goals_due_date_idx" ON "goals"("due_date");

-- CreateIndex
CREATE INDEX "key_performance_indicators_goal_id_idx" ON "key_performance_indicators"("goal_id");

-- CreateIndex
CREATE INDEX "performance_reviews_employee_id_period_end_idx" ON "performance_reviews"("employee_id", "period_end");

-- CreateIndex
CREATE INDEX "performance_reviews_reviewer_id_status_idx" ON "performance_reviews"("reviewer_id", "status");

-- CreateIndex
CREATE INDEX "announcements_published_at_idx" ON "announcements"("published_at");

-- CreateIndex
CREATE INDEX "announcements_audience_idx" ON "announcements"("audience");

-- CreateIndex
CREATE UNIQUE INDEX "announcement_reads_announcement_id_user_id_key" ON "announcement_reads"("announcement_id", "user_id");

-- CreateIndex
CREATE INDEX "notifications_user_id_is_read_created_at_idx" ON "notifications"("user_id", "is_read", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_created_at_idx" ON "audit_logs"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_entity_entity_id_idx" ON "audit_logs"("entity", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_action_created_at_idx" ON "audit_logs"("action", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "system_settings_key_key" ON "system_settings"("key");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_head_id_fkey" FOREIGN KEY ("head_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_designation_id_fkey" FOREIGN KEY ("designation_id") REFERENCES "designations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_corrected_by_id_fkey" FOREIGN KEY ("corrected_by_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_balances" ADD CONSTRAINT "leave_balances_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_balances" ADD CONSTRAINT "leave_balances_leave_type_id_fkey" FOREIGN KEY ("leave_type_id") REFERENCES "leave_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_leave_type_id_fkey" FOREIGN KEY ("leave_type_id") REFERENCES "leave_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_hr_approver_id_fkey" FOREIGN KEY ("hr_approver_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_documents" ADD CONSTRAINT "employee_documents_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_documents" ADD CONSTRAINT "employee_documents_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_documents" ADD CONSTRAINT "employee_documents_verified_by_id_fkey" FOREIGN KEY ("verified_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_structures" ADD CONSTRAINT "salary_structures_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_structures" ADD CONSTRAINT "salary_structures_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_processed_by_id_fkey" FOREIGN KEY ("processed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_payroll_run_id_fkey" FOREIGN KEY ("payroll_run_id") REFERENCES "payroll_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_generated_by_id_fkey" FOREIGN KEY ("generated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_openings" ADD CONSTRAINT "job_openings_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_openings" ADD CONSTRAINT "job_openings_designation_id_fkey" FOREIGN KEY ("designation_id") REFERENCES "designations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_openings" ADD CONSTRAINT "job_openings_hiring_manager_id_fkey" FOREIGN KEY ("hiring_manager_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_openings" ADD CONSTRAINT "job_openings_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_job_opening_id_fkey" FOREIGN KEY ("job_opening_id") REFERENCES "job_openings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_hired_employee_id_fkey" FOREIGN KEY ("hired_employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_interviewer_id_fkey" FOREIGN KEY ("interviewer_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offers" ADD CONSTRAINT "offers_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offers" ADD CONSTRAINT "offers_job_opening_id_fkey" FOREIGN KEY ("job_opening_id") REFERENCES "job_openings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offers" ADD CONSTRAINT "offers_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offers" ADD CONSTRAINT "offers_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offers" ADD CONSTRAINT "offers_designation_id_fkey" FOREIGN KEY ("designation_id") REFERENCES "designations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offers" ADD CONSTRAINT "offers_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goals" ADD CONSTRAINT "goals_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goals" ADD CONSTRAINT "goals_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "key_performance_indicators" ADD CONSTRAINT "key_performance_indicators_goal_id_fkey" FOREIGN KEY ("goal_id") REFERENCES "goals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance_reviews" ADD CONSTRAINT "performance_reviews_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance_reviews" ADD CONSTRAINT "performance_reviews_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_designation_id_fkey" FOREIGN KEY ("designation_id") REFERENCES "designations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcement_reads" ADD CONSTRAINT "announcement_reads_announcement_id_fkey" FOREIGN KEY ("announcement_id") REFERENCES "announcements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcement_reads" ADD CONSTRAINT "announcement_reads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "system_settings" ADD CONSTRAINT "system_settings_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
