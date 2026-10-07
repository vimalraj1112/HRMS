# SuperLink HRMS

Production-oriented Human Resource Management System for **SuperLink IT Services**.

Full-stack, database-backed, role-aware and auditable — no mocked data.

| Layer | Stack |
| --- | --- |
| Frontend | React 19 · TypeScript · Vite · Tailwind CSS 4 · React Router · TanStack Query · React Hook Form · Zod · Axios · Recharts · Lucide |
| Backend | Node.js · Express 5 · TypeScript · Prisma ORM · PostgreSQL · Zod · JWT (access + refresh rotation) · bcrypt · Redis (optional) |
| Storage | Pluggable object storage — local disk in dev, any S3-compatible provider in production |

---

## Repository layout

```
HRMS/
├── server/                  Express REST API
│   ├── prisma/
│   │   ├── schema.prisma    20+ models, enums, indexes, constraints
│   │   └── seed.ts          Development seed data
│   ├── src/
│   │   ├── config/          env validation, logger, prisma, cache
│   │   ├── middleware/      auth, rbac, validate, error handler
│   │   ├── modules/         feature modules (controller/service/routes/validator)
│   │   ├── routes/          /api/v1 router
│   │   ├── utils/           ApiError, response helpers, request helpers
│   │   ├── validators/      shared zod schemas
│   │   ├── app.ts           express app factory
│   │   └── server.ts        bootstrap + graceful shutdown
│   └── tests/               vitest suites
└── client/                  React web application
    └── src/
        ├── components/      ui primitives, layout, routing guards
        ├── config/          role-aware navigation
        ├── lib/             axios client, query client, formatters
        ├── pages/           route pages
        ├── stores/          zustand (auth + UI state only)
        └── types/           shared API types
```

## Requirements

- Node.js >= 20.11
- PostgreSQL >= 14 (local install or managed)
- npm 10+

## Setup

```bash
# 1. install dependencies (npm workspaces)
npm install

# 2. configure the API
copy server\.env.example server\.env        # Windows
# cp server/.env.example server/.env        # macOS / Linux
# then edit server/.env: DATABASE_URL, JWT secrets, seed passwords

# 3. create the database (once)
createdb -U postgres superlink_hrms
createdb -U postgres superlink_hrms_test

# 4. generate the Prisma client + run migrations
npm run db:generate
npm run db:migrate

# 5. seed development data
npm run db:seed
```

Or run steps 3-5 in one command after configuring `.env`:

```bash
npm run setup
```

## Running

```bash
npm run dev          # API on :4000 and web app on :5173
npm run dev:server   # API only
npm run dev:client   # web app only
```

Open <http://localhost:5173> and sign in with a seeded account.

### Seeded development accounts

Credentials come from `SEED_*` variables in `server/.env` — never hard-coded in the repository.

| Role | Email |
| --- | --- |
| SUPER_ADMIN | `superadmin@superlink.local` |
| HR_ADMIN | `hradmin@superlink.local` |
| HR_MANAGER | `hrmanager@superlink.local` |
| MANAGER | `manager.eng@superlink.local`, `manager.support@superlink.local` |
| FINANCE | `finance@superlink.local` |
| RECRUITER | `recruiter@superlink.local` |
| EMPLOYEE | `ananya@superlink.local` … `aman@superlink.local` (10 accounts) |

The seed also creates 6 departments, 16 designations, 6 leave types, holidays for this year and next, 30 days of attendance and sample leave requests.

## Quality gates

```bash
npm run typecheck        # tsc --noEmit (server + client)
npm run lint             # eslint (server + client)
npm run test             # vitest (server, uses the *_test database)
npm run test:coverage    # same suite with v8 coverage, fails under the thresholds
npm run build            # tsc build + vite build
```

The server suite holds 298 tests in 18 files: every module has API tests for its happy path, validation, RBAC boundaries and audit output, plus unit tests for the storage key guards. Coverage thresholds live in `server/vitest.config.ts` (84% statements, 67% branches, 86% functions, 89% lines) so a regression that skips tests fails the gate.

## API conventions

Base URL: `/api/v1`

```jsonc
// success
{ "success": true, "message": "…", "data": {}, "meta": null }

// error
{ "success": false, "message": "…", "errors": [], "meta": null }
```

Status codes: 400 validation · 401 unauthenticated · 403 unauthorized · 404 not found · 409 conflict · 422 business rule violation · 429 rate limited · 500 internal error.

List endpoints accept `page`, `limit`, `search`, `sortBy`, `sortOrder` plus module-specific filters, and return pagination metadata in `meta`.

## Roles

`SUPER_ADMIN` · `HR_ADMIN` · `HR_MANAGER` · `MANAGER` · `FINANCE` · `RECRUITER` · `EMPLOYEE`

Authorization is enforced server-side on every endpoint; the client only hides UI it cannot use.

## Authentication

- `POST /auth/login` returns a short-lived access token in the body and a rotating refresh token in the `slhrms_rt` httpOnly cookie (`Path=/api/v1/auth`).
- `POST /auth/refresh` rotates the refresh token. Replaying a rotated token revokes every session for that user and is audited.
- `POST /auth/logout` revokes the current session, `POST /auth/logout-all` revokes all of them, `GET /auth/me` returns the signed-in user.
- Access tokens carry a `tokenVersion` claim checked against the user record, so a password change, password reset, or account suspension invalidates outstanding access tokens immediately.
- A single logout cannot retract an already-issued access token; the client discards it at once and the server rejects it after `JWT_ACCESS_TTL` (15 minutes by default).
- `POST /auth/change-password` requires the current password, a policy-compliant new password, and a matching confirmation.
- Repeated failed logins lock the account for `LOGIN_LOCK_MINUTES`; every authentication event is written to the audit log.
- Forgot/reset-password email delivery is deferred until SMTP credentials are configured. Administrators can issue a one-time password from the user management endpoints.

### User management endpoints

| Method | Path | Permission |
| --- | --- | --- |
| `GET` | `/users` | `user:read` |
| `POST` | `/users` | `user:manage` |
| `GET` | `/users/:id` | `user:read` |
| `PATCH` | `/users/:id/role` | `user:manage` |
| `PATCH` | `/users/:id/status` | `user:manage` |
| `POST` | `/users/:id/reset-password` | `user:manage` |

Guards in place: administrators cannot change their own role, cannot deactivate themselves, and the last active `SUPER_ADMIN` cannot be demoted.

### Employee and organisation endpoints

| Method | Path | Permission |
| --- | --- | --- |
| `GET` | `/employees` | `employee:read:own` / `employee:read:team` / `employee:read:any` |
| `POST` | `/employees` | `employee:create` |
| `GET` | `/employees/:id` | Employee scope (own / team / any) |
| `PATCH` | `/employees/:id` | `employee:update` (own contact fields otherwise) |
| `PATCH` | `/employees/:id/status` | `employee:status` |
| `DELETE` | `/employees/:id` | `employee:delete` |
| `GET`/`POST` | `/departments` | `department:read` / `department:manage` |
| `GET`/`PATCH`/`DELETE` | `/departments/:id` | `department:read` / `department:manage` |
| `GET`/`POST` | `/designations` | `designation:read` / `designation:manage` |
| `GET`/`PATCH`/`DELETE` | `/designations/:id` | `designation:read` / `designation:manage` |

Employee list access is scoped: `SUPER_ADMIN`, `HR_ADMIN`, `HR_MANAGER` and `FINANCE` see everyone; `MANAGER` sees only their direct reports; `EMPLOYEE` sees only themselves. An employee code is generated automatically when one is not supplied.

Employees without `employee:update` may only change their own contact details (phone, address, city, state, postal code, emergency contacts, profile photo). PAN, Aadhaar and bank details are redacted for team-level viewers. Changing an employee's status to suspended, resigned or terminated updates the linked user account and revokes their sessions; reactivating restores sign-in. Employees can only be deleted once resigned or terminated and only when they have no attendance, leave or payroll history.

### Attendance endpoints

| Method | Path | Permission |
| --- | --- | --- |
| `GET` | `/attendance/my` | `attendance:read:own` |
| `GET` | `/attendance/team` | `attendance:read:team` |
| `GET` | `/attendance` | `attendance:read:any` (HR scope, manager limited to their team) |
| `GET` | `/attendance/summary` | Same scoping as the list endpoint |
| `POST` | `/attendance` | `attendance:mark` (own, today only) or `attendance:correct` (any employee) |
| `PATCH` | `/attendance/:id` | `attendance:correct` |

Self marking accepts `PRESENT`, `LATE` and `HALF_DAY` for the current day and needs a check-in time; an existing record for the day returns `409`, an approved leave request returns `422`, and an existing `WEEK_OFF` or `HOLIDAY` row cannot be overwritten. HR records and corrections capture the acting user and are audited under `ATTENDANCE_CREATE`, `ATTENDANCE_UPDATE` and `ATTENDANCE_CORRECTION`. Dates are compared in UTC and the working week is Saturday to Sunday.

### Leave and holiday endpoints

| Method | Path | Permission |
| --- | --- | --- |
| `GET` | `/leaves/my` | `leave:read:own` |
| `GET` | `/leaves` | `leave:read:any` (manager scoped to their team) / `leave:read:own` |
| `GET` | `/leaves/approvals` | `leave:approve:manager` / `leave:approve:hr` / `leave:manage` |
| `GET` | `/leaves/:id` | `leave:read:any` / `leave:read:own` |
| `POST` | `/leaves` | `leave:apply` |
| `POST` | `/leaves/:id/decision` | `leave:approve:manager` / `leave:approve:hr` / `leave:manage` |
| `POST` | `/leaves/:id/cancel` | Request owner or `leave:manage` |
| `GET` | `/leave-balances/me` | `leave:read:own` |
| `GET` | `/leave-balances/:id` | `leaveBalance:manage` / `leave:read:any` |
| `PATCH` | `/leave-balances/:id` | `leaveBalance:manage` |
| `POST` | `/leave-balances/rollover?fromYear=&toYear=` | `leaveBalance:manage` |
| `GET`/`POST` | `/leave-types` | `leaveType:read` / `leaveType:manage` |
| `GET`/`PATCH`/`DELETE` | `/leave-types/:id` | `leaveType:read` / `leaveType:manage` |
| `GET`/`POST` | `/holidays` | `holiday:read` / `holiday:manage` |
| `GET`/`PATCH`/`DELETE` | `/holidays/:id` | `holiday:read` / `holiday:manage` |

Requests must start in the future, stay inside one calendar year, respect the leave type's minimum notice, avoid weekends and active holidays, and not overlap an existing request. Working days come from `server/src/utils/workdays.ts`. Approval runs manager stage then HR stage; the manager stage belongs to the reporting line and HR may override it, nobody approves their own request, and a final approval moves reserved days from `pending` to `used` and books `ON_LEAVE` attendance rows. Rejection and cancellation release the reservation.

Leave balance rows are created when a leave type is created and lazily for any later request, always at the type's annual quota. Available balance is `allocated + carriedForward − used − pending`; HR can grant or correct a row with `PATCH /leave-balances/:id` as long as the new allocation still covers days already used or pending. `POST /leave-balances/rollover` creates the next year's row for every active employee and leave type, carrying forward up to the type's `maxCarryForward` limit; it is idempotent and keeps any larger existing grant.

### Notification and audit endpoints

| Method | Path | Permission |
| --- | --- | --- |
| `GET` | `/notifications` | `notification:read:own` |
| `GET` | `/notifications/unread-count` | `notification:read:own` |
| `POST` | `/notifications/read-all` | `notification:read:own` |
| `PATCH` | `/notifications/:id/read` | `notification:read:own` |
| `PATCH` | `/notifications/:id/unread` | `notification:read:own` |
| `GET` | `/audit-logs` | `audit:read` |
| `GET` | `/audit-logs/:id` | `audit:read` |

Notifications are raised by the module that owns the event: a manager is told when their report applies for leave, the employee is told about every leave decision, HR cancellation and HR attendance corrections, and everyone gets a payslip notice when payroll runs. Delivery failures are swallowed so a notification problem can never roll back the business transaction that triggered it.

Audit entries record the acting user, IP, user agent and request id. Passwords, tokens and per-employee salary figures are never written into `oldValue` or `newValue` — a salary revision records only its dates, activation flag and which components moved, while a payroll run records aggregate totals. Filter with `action`, `entity`, `entityId`, `userId`, `userEmail`, `from` and `to`; the response adds `actions` and `entities` facets, each scoped to the other active filters. Reading a single payslip is audited as `PAYSLIP_DOWNLOAD`, and streaming a file is audited as `DOCUMENT_DOWNLOAD`.

### Document endpoints

| Method | Path | Permission |
| --- | --- | --- |
| `GET` | `/documents` | `document:read:own` / `document:read:any` |
| `GET` | `/documents/:id` | `document:read:own` / `document:read:any` |
| `POST` | `/documents` | `document:upload` (multipart, field `file`) |
| `PATCH` | `/documents/:id/verify` | `document:verify` |
| `DELETE` | `/documents/:id` | `document:delete` |
| `GET` | `/documents/:id/download` | `document:read:own` / `document:read:any` |

Storage sits behind `server/src/services/storage.service.ts`, which exposes `put`, `readStream`, `size`, `exists` and `remove` over opaque keys. `STORAGE_DRIVER=local` writes under `STORAGE_LOCAL_PATH` (default `server/uploads`); `STORAGE_DRIVER=s3` uses the same interface against any S3-compatible provider. Keys are generated as `documents/<documentId>/<documentId><ext>` and never contain the original file name, so an upload can neither overwrite another document nor write outside the storage root.

`POST /documents` takes multipart form data with `file` plus `type`, `title` and optional `employeeId` and `expiresAt`. The MIME type must be in `UPLOAD_ALLOWED_MIME_TYPES` and the size must stay under `UPLOAD_MAX_FILE_SIZE_MB`, both enforced before anything touches storage. Anyone may upload to their own record; uploading for somebody else needs `document:read:any` for that employee. HR is notified when an employee submits a document, and the employee is notified when HR verifies or reopens one.

Deleting is a soft delete: the row keeps its audit history but the stored file is removed immediately and every later read returns `404`. `GET /documents` supports `employeeId`, `type`, `isVerified`, `expiringWithinDays` and `includeDeleted`, all scoped to the caller's employee scope.

### Payroll endpoints

| Method | Path | Permission |
| --- | --- | --- |
| `GET` | `/payroll/salary-structures` | `salary:read:own` / `salary:read:any` |
| `GET` | `/payroll/salary-structures/:id` | `salary:read:own` / `salary:read:any` |
| `POST` | `/payroll/salary-structures` | `salary:manage` |
| `PATCH` | `/payroll/salary-structures/:id` | `salary:manage` |
| `DELETE` | `/payroll/salary-structures/:id` | `salary:manage` |
| `GET` | `/payroll/runs` | `payroll:read` |
| `POST` | `/payroll/runs/process` | `payroll:process` |
| `POST` | `/payroll/runs/:id/lock` | `payroll:lock` |
| `GET` | `/payroll/payslips` | `payslip:read:own` / `payslip:read:any` |
| `GET` | `/payroll/payslips/:id` | `payslip:read:own` / `payslip:read:any` |

Compensation is owned by `FINANCE`; `HR_ADMIN` can read salary and payslips but cannot change them. Employees only ever see their own records.

A salary structure is a dated revision. Gross is the sum of basic, HRA, transport, medical and other allowance. Net is gross minus PF, ESI, professional tax, TDS and any other deduction; deductions may not exceed gross. Each employee keeps at most one open-ended structure, so creating a revision closes the previous one the day before it starts, and a revision that has already taken effect or has payslips can only be deactivated.

`POST /payroll/runs/process` builds a month from attendance. It refuses a month that has not finished and refuses any month that is already processed or locked with `409`, and it skips employees who joined after the month ended or left before it began. For every other employee it counts working days from the calendar, excluding weekends and active holidays. Approved leave is paid, and any other unrecorded or absent working day is loss of pay at `gross ÷ working days`. Only a run left in `DRAFT` can be run again, which regenerates every payslip for that month.

`POST /payroll/runs/:id/lock` freezes the run and marks all of its payslips locked. Locking twice returns `409`.

### Dashboard endpoint

| Method | Path | Permission |
| --- | --- | --- |
| `GET` | `/dashboard` | any authenticated user |

One response, shaped to the caller. The RBAC scope decides what it contains: an employee gets their own attendance, leave, documents and latest payslip, while a manager or HR caller also gets team and organisation blocks. Headcount, payroll and recruitment blocks are only included when the caller holds the matching permission (`payroll:read` / `payslip:read:any` for payroll, `job:manage` / `candidate:manage` for recruitment), so a self-scoped caller never receives organisation payroll.

### Recruitment endpoints

| Method | Path | Permission |
| --- | --- | --- |
| `GET` | `/recruitment/jobs` | `job:manage` |
| `GET` | `/recruitment/jobs/:id` | `job:manage` |
| `POST` | `/recruitment/jobs` | `job:manage` |
| `PATCH` | `/recruitment/jobs/:id` | `job:manage` |
| `DELETE` | `/recruitment/jobs/:id` | `job:manage` |
| `GET` | `/recruitment/candidates` | `candidate:manage` |
| `GET` | `/recruitment/candidates/:id` | `candidate:manage` |
| `POST` | `/recruitment/candidates` | `candidate:manage` |
| `PATCH` | `/recruitment/candidates/:id` | `candidate:manage` |
| `POST` | `/recruitment/candidates/:id/resume` | `candidate:manage` (multipart, field `file`) |
| `GET` | `/recruitment/candidates/:id/resume` | `candidate:manage` |
| `DELETE` | `/recruitment/candidates/:id` | `candidate:manage` |
| `GET` | `/recruitment/interviews` | `interview:manage` |
| `GET` | `/recruitment/interviews/:id` | `interview:manage` |
| `POST` | `/recruitment/interviews` | `interview:manage` |
| `PATCH` | `/recruitment/interviews/:id` | `interview:manage` |
| `POST` | `/recruitment/interviews/:id/feedback` | `interview:manage` / `interview:feedback` |
| `GET` | `/recruitment/offers` | `offer:manage` |
| `GET` | `/recruitment/offers/:id` | `offer:manage` |
| `POST` | `/recruitment/offers` | `offer:manage` |
| `PATCH` | `/recruitment/offers/:id` | `offer:manage` |
| `POST` | `/recruitment/offers/:id/respond` | `offer:manage` |

Jobs, candidates, interviews and offers are state machines: every status change goes through an explicit allow-list and anything else returns `409`, and a rejection that has no reason is `422`. Job titles and candidate emails are validated up front, duplicate candidate emails are `409`, and a job that still has candidates cannot be deleted. Hiring a candidate requires a linked employee record, so the hire produces the employee instead of a second copy of the same person.

Resumes use the same storage service as employee documents and the same upload limits; the key never contains the original file name. A candidate with no resume returns `404` on download. Interviews can only be scheduled in the future and every interview transition (scheduled → completed, etc.) is checked the same way.

### Performance endpoints

| Method | Path | Permission |
| --- | --- | --- |
| `GET` | `/performance/goals` | `goal:manage:own` |
| `POST` | `/performance/goals` | `goal:manage:own` |
| `GET` | `/performance/goals/:id` | `goal:manage:own` |
| `PATCH` | `/performance/goals/:id` | `goal:manage:own` |
| `DELETE` | `/performance/goals/:id` | `goal:manage:own` |
| `GET` | `/performance/reviews` | `review:read:own` |
| `GET` | `/performance/reviews/:id` | `review:read:own` |
| `POST` | `/performance/reviews` | `review:manage:team` / `review:manage:any` |
| `PATCH` | `/performance/reviews/:id` | `review:manage:team` / `review:manage:any` |
| `POST` | `/performance/reviews/:id/submit` | `review:manage:team` / `review:manage:any` |
| `POST` | `/performance/reviews/:id/acknowledge` | `review:read:own` |

The permission gates creation, but visibility is scoped row by row: employees only ever read their own goals and the reviews they take part in, managers see their team, HR sees everything. A goal's KPI weights may add up to at most 100, start dates cannot be after due dates, and a KPI sent in an update must belong to that goal. Reviews move draft → submitted → acknowledged; only drafts can be submitted, submission requires a manager rating, acknowledgement is restricted to the employee being reviewed, and an acknowledged review is locked against further edits.

### Announcement endpoints

| Method | Path | Permission |
| --- | --- | --- |
| `GET` | `/announcements` | `announcement:read` |
| `GET` | `/announcements/unread-count` | `announcement:read` |
| `GET` | `/announcements/:id` | `announcement:read` |
| `POST` | `/announcements` | `announcement:manage` |
| `PATCH` | `/announcements/:id` | `announcement:manage` |
| `DELETE` | `/announcements/:id` | `announcement:manage` |
| `POST` | `/announcements/:id/read` | `announcement:read` |

Every announcement targets everyone, a role, a department, a designation or one employee. The list only returns what the caller is entitled to read, `unread-count` backs the navigation badge, and `POST /:id/read` records the read so the badge drops.

### Report endpoints

| Method | Path | Permission |
| --- | --- | --- |
| `GET` | `/reports/overview` | `reports:hr` |
| `GET` | `/reports/headcount` | `reports:hr` |
| `GET` | `/reports/attendance` | `reports:hr` |
| `GET` | `/reports/leave` | `reports:hr` |
| `GET` | `/reports/payroll` | `reports:finance` |
| `GET` | `/reports/export` | `reports:hr` / `reports:finance` |

Every report takes an optional `from`/`to` range, which defaults to the last 30 days ending today, and returns a payload with `report`, `range`, `summary` and `rows`. Payroll is per month and year and stays behind `reports:finance`. `GET /reports/export` streams the same data as CSV with a generated file name; the type's own permission is still enforced, so a finance caller cannot export an HR report.

### Settings endpoints

| Method | Path | Permission |
| --- | --- | --- |
| `GET` | `/settings` | any authenticated user (core keys) |
| `GET` | `/settings/:key` | any authenticated user (core keys) |
| `PUT` | `/settings/:key` | `settings:manage` |
| `DELETE` | `/settings/:key` | `settings:manage` |

Settings are seeded on first read, so a fresh install never returns `404`. Non-managers only see the core keys (`companyName`, `defaultCurrency`, `workingDaysPerWeek`, `weekendDays`, `enableAnnouncements`); extra keys require `settings:manage` to read at all. Writes and deletions are audited with the previous and new value redacted through the same helper the audit log uses.

## Security

- **Headers**: helmet on every response (`nosniff`, `X-Frame-Options`, referrer policy, `Cross-Origin-Resource-Policy`, and a CSP + HSTS in production), `X-Powered-By` disabled, and an `X-Request-Id` echoed on every response and written into the logs.
- **CORS**: explicit origin allowlist (`CORS_ORIGINS`); a request from any other origin receives no CORS headers. Cookies are `httpOnly` + `Secure`, scoped to `Path=/api/v1/auth`.
- **Rate limiting**: draft-7 `RateLimit` headers on all API responses — `RATE_LIMIT_MAX` (300 / 15 min / IP) globally and `AUTH_RATE_LIMIT_MAX` (20 / 15 min / IP) on authentication endpoints.
- **Tokens**: 15 minute access tokens with a `tokenVersion` claim, rotating refresh tokens with reuse detection (replay revokes every session), and secret separation between access and refresh signing.
- **Credentials**: bcrypt (12 rounds), a server-side password policy, account lockout after `LOGIN_MAX_ATTEMPTS`, generic "Invalid email or password" responses so accounts cannot be enumerated, and forced password rotation on first sign-in.
- **Validation**: every route body, query and params document is parsed with Zod; failures return a single `VALIDATION_ERROR` envelope with per-field messages. Responses never include a stack trace — set `DEBUG_ERROR_STACK=true` locally if you need one (production refuses it).
- **Uploads**: MIME allowlist, size cap (`UPLOAD_MAX_FILE_SIZE_MB`), generated storage keys that embed only the document id, and a path guard that rejects traversal, absolute paths and unsafe characters before any disk access.
- **Audit**: sign-ins, password changes, user/employee/org changes, leave decisions, payroll runs, payslip reads (`PAYSLIP_DOWNLOAD`), settings writes, report exports and recruitment transitions are all recorded with actor, IP and request id.
- **Dependencies**: `npm audit` reports 0 vulnerabilities. `uuid`, `deepmerge-ts` and `shell-quote` are pinned through root `overrides` because their dependents still declare incompatible ranges.
- **Environment guards**: the API boots in `NODE_ENV=production` only if the JWT secrets are long enough, storage credentials are present for the chosen driver, and the seed passwords are no longer `ChangeMe@123`.

## Deployment

The repository ships a production-shaped stack: `server/Dockerfile` (multi-stage: build → migrate → non-root runtime), `client/Dockerfile` (Vite build served by nginx) and `docker-compose.yml`.

```bash
docker compose up -d
docker compose ps      # db healthy → migrate exited 0 → server healthy → client up
docker compose down     # stop (add -v to drop the database and upload volumes)
```

| Service | Image | Port | Notes |
| --- | --- | --- | --- |
| `db` | `postgres:18-alpine` | internal | data volume mounted at `/var/lib/postgresql` (Postgres 18 layout) |
| `migrate` | server build stage | — | `prisma migrate deploy` then the idempotent seed; the server waits for it |
| `server` | node runtime, `USER node` | `4001 → 4000` | health checked on `/api/v1/health`, uploads volume at `/data/uploads` |
| `client` | nginx | `8080 → 80` | SPA with `try_files` fallback; `/api/` reverse-proxied to `server:4000` |

The bundled client calls the API on its own origin (`VITE_API_URL=/api/v1`), so the browser never needs a CORS preflight behind nginx. Override the wiring with `WEB_PORT`, `API_PORT`, `API_PUBLIC_URL` and `CORS_ORIGINS` if the defaults clash with something already running.

Before exposing the stack: replace `JWT_SECRET`, `JWT_REFRESH_SECRET` and the three `SEED_*` passwords (compose ships demo values so `docker compose up` works out of the box, and production startup refuses the stock `ChangeMe@123`), and terminate TLS in front of `client` — the refresh cookie is `Secure`, which browsers accept on `localhost` but not on plain HTTP over a LAN address.

Local development does not need Docker: `npm run dev` starts the API on 4000 and Vite on 5173 against your own Postgres.

## Environment variables

See `server/.env.example` and `client/.env.example`. Secrets are never committed — `.env`, `.env.local` and `.env.test` are git-ignored.

## Build progress

| Phase | Scope | Status |
| --- | --- | --- |
| 1 | Project setup, tooling, env, logging, error handling | done |
| 2 | Database schema, migrations, seed | done |
| 3 | Authentication + RBAC | done |
| 4 | Employees, departments, designations | done |
| 5 | Attendance, leave types, balances, approvals, holidays | done |
| 6 | Notifications, audit logs | done |
| 7 | Dashboard | done |
| 8 | Employee documents | done |
| 9 | Payroll: salary structures, runs, payslips | done |
| 10 | Recruitment | done |
| 11 | Performance: goals, reviews | done |
| 12 | Reports + settings | done |
| 13-15 | Testing, security hardening, deployment | done |
