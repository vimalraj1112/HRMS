import { type Prisma, Role, EmploymentType, Gender, EmployeeStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';
import path from 'node:path';
import dotenv from 'dotenv';
import { prisma } from '../src/config/prisma';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const CURRENT_YEAR = new Date().getUTCFullYear();
const SALT_ROUNDS = Number(process.env.BCRYPT_SALT_ROUNDS ?? 12);

function utcDate(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function dayOffset(days: number): Date {
  const date = utcDate(new Date());
  date.setUTCDate(date.getUTCDate() + days);
  return date;
}

function isWeekend(date: Date): boolean {
  const day = date.getUTCDay();
  return day === 0 || day === 6;
}

function atTime(date: Date, hours: number, minutes: number): Date {
  const value = utcDate(date);
  value.setUTCHours(hours, minutes, 0, 0);
  return value;
}

const DEPARTMENTS = [
  { name: 'Engineering', code: 'ENG', description: 'Product engineering and platform development' },
  { name: 'Human Resources', code: 'HR', description: 'People operations, talent and culture' },
  { name: 'Finance', code: 'FIN', description: 'Accounting, payroll and compliance' },
  { name: 'Sales', code: 'SAL', description: 'Business development and client acquisition' },
  { name: 'Customer Support', code: 'SUP', description: 'Technical support and service delivery' },
  { name: 'Operations', code: 'OPS', description: 'Business operations and administration' },
];

const DESIGNATIONS = [
  { name: 'General Manager', code: 'GM', level: 10 },
  { name: 'Engineering Manager', code: 'EM', level: 9 },
  { name: 'HR Manager', code: 'HRM', level: 8 },
  { name: 'Finance Manager', code: 'FM', level: 8 },
  { name: 'Sales Manager', code: 'SM', level: 8 },
  { name: 'Team Lead', code: 'TL', level: 7 },
  { name: 'Senior Software Engineer', code: 'SSE', level: 6 },
  { name: 'Software Engineer', code: 'SE', level: 5 },
  { name: 'QA Engineer', code: 'QA', level: 5 },
  { name: 'DevOps Engineer', code: 'DEVOPS', level: 6 },
  { name: 'HR Executive', code: 'HRE', level: 4 },
  { name: 'Recruiter', code: 'REC', level: 4 },
  { name: 'Accounts Executive', code: 'AE', level: 4 },
  { name: 'Sales Executive', code: 'SLE', level: 4 },
  { name: 'Support Engineer', code: 'SUPE', level: 4 },
  { name: 'HR Intern', code: 'HRI', level: 1 },
];

const LEAVE_TYPES = [
  {
    name: 'Casual Leave',
    code: 'CL',
    annualQuota: 12,
    minDaysNotice: 1,
    description: 'Short personal absences',
    color: '#3b82f6',
  },
  {
    name: 'Sick Leave',
    code: 'SL',
    annualQuota: 12,
    minDaysNotice: 0,
    description: 'Illness and medical appointments',
    color: '#ef4444',
  },
  {
    name: 'Earned Leave',
    code: 'EL',
    annualQuota: 15,
    minDaysNotice: 3,
    description: 'Planned vacation and personal time',
    color: '#10b981',
  },
  {
    name: 'Paid Leave',
    code: 'PL',
    annualQuota: 0,
    minDaysNotice: 7,
    description: 'Paid leave granted by HR',
    color: '#8b5cf6',
  },
  {
    name: 'Maternity Leave',
    code: 'ML',
    annualQuota: 180,
    minDaysNotice: 30,
    description: 'Statutory maternity leave',
    color: '#ec4899',
  },
  {
    name: 'Unpaid Leave',
    code: 'UL',
    annualQuota: 0,
    minDaysNotice: 7,
    isPaid: false,
    description: 'Leave without pay',
    color: '#64748b',
  },
];

function holidaysForYear(year: number) {
  return [
    { name: "New Year's Day", date: new Date(Date.UTC(year, 0, 1)), type: 'PUBLIC' as const },
    { name: 'Republic Day', date: new Date(Date.UTC(year, 0, 26)), type: 'PUBLIC' as const },
    { name: 'Holi', date: new Date(Date.UTC(year, 2, 14)), type: 'OPTIONAL' as const },
    { name: 'Independence Day', date: new Date(Date.UTC(year, 7, 15)), type: 'PUBLIC' as const },
    { name: 'Gandhi Jayanti', date: new Date(Date.UTC(year, 9, 2)), type: 'PUBLIC' as const },
    { name: 'Christmas Day', date: new Date(Date.UTC(year, 11, 25)), type: 'PUBLIC' as const },
  ];
}

interface SeedEmployee {
  employeeCode: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  gender: Gender;
  role: Role;
  password: string;
  departmentCode: string;
  designationCode: string;
  employmentType?: EmploymentType;
  joiningOffsetDays: number;
  managerIndex?: number;
  isDepartmentHead?: boolean;
  basicSalary: number;
}

const DEFAULT_PASSWORD = process.env.SEED_DEFAULT_PASSWORD ?? 'ChangeMe@123';
const SUPER_ADMIN_EMAIL = process.env.SEED_SUPER_ADMIN_EMAIL ?? 'superadmin@superlink.local';
const SUPER_ADMIN_PASSWORD = process.env.SEED_SUPER_ADMIN_PASSWORD ?? DEFAULT_PASSWORD;
const HR_ADMIN_EMAIL = process.env.SEED_HR_ADMIN_EMAIL ?? 'hradmin@superlink.local';
const HR_ADMIN_PASSWORD = process.env.SEED_HR_ADMIN_PASSWORD ?? DEFAULT_PASSWORD;

const EMPLOYEES: SeedEmployee[] = [
  {
    employeeCode: 'SL0001',
    firstName: 'Aarav',
    lastName: 'Sharma',
    email: SUPER_ADMIN_EMAIL,
    phone: '+91 98000 00001',
    gender: Gender.MALE,
    role: Role.SUPER_ADMIN,
    password: SUPER_ADMIN_PASSWORD,
    departmentCode: 'OPS',
    designationCode: 'GM',
    joiningOffsetDays: -2200,
    isDepartmentHead: true,
    basicSalary: 320000,
  },
  {
    employeeCode: 'SL0002',
    firstName: 'Priya',
    lastName: 'Nair',
    email: HR_ADMIN_EMAIL,
    phone: '+91 98000 00002',
    gender: Gender.FEMALE,
    role: Role.HR_ADMIN,
    password: HR_ADMIN_PASSWORD,
    departmentCode: 'HR',
    designationCode: 'HRM',
    joiningOffsetDays: -1900,
    isDepartmentHead: true,
    basicSalary: 180000,
  },
  {
    employeeCode: 'SL0003',
    firstName: 'Rahul',
    lastName: 'Verma',
    email: 'hrmanager@superlink.local',
    phone: '+91 98000 00003',
    gender: Gender.MALE,
    role: Role.HR_MANAGER,
    password: DEFAULT_PASSWORD,
    departmentCode: 'HR',
    designationCode: 'TL',
    joiningOffsetDays: -1500,
    managerIndex: 1,
    basicSalary: 120000,
  },
  {
    employeeCode: 'SL0004',
    firstName: 'Sneha',
    lastName: 'Iyer',
    email: 'manager.eng@superlink.local',
    phone: '+91 98000 00004',
    gender: Gender.FEMALE,
    role: Role.MANAGER,
    password: DEFAULT_PASSWORD,
    departmentCode: 'ENG',
    designationCode: 'EM',
    joiningOffsetDays: -1400,
    managerIndex: 0,
    isDepartmentHead: true,
    basicSalary: 260000,
  },
  {
    employeeCode: 'SL0005',
    firstName: 'Imran',
    lastName: 'Khan',
    email: 'manager.support@superlink.local',
    phone: '+91 98000 00005',
    gender: Gender.MALE,
    role: Role.MANAGER,
    password: DEFAULT_PASSWORD,
    departmentCode: 'SUP',
    designationCode: 'SM',
    joiningOffsetDays: -1100,
    managerIndex: 0,
    basicSalary: 165000,
  },
  {
    employeeCode: 'SL0006',
    firstName: 'Divya',
    lastName: 'Rao',
    email: 'finance@superlink.local',
    phone: '+91 98000 00006',
    gender: Gender.FEMALE,
    role: Role.FINANCE,
    password: DEFAULT_PASSWORD,
    departmentCode: 'FIN',
    designationCode: 'FM',
    joiningOffsetDays: -1700,
    isDepartmentHead: true,
    basicSalary: 195000,
  },
  {
    employeeCode: 'SL0007',
    firstName: 'Karan',
    lastName: 'Mehta',
    email: 'recruiter@superlink.local',
    phone: '+91 98000 00007',
    gender: Gender.MALE,
    role: Role.RECRUITER,
    password: DEFAULT_PASSWORD,
    departmentCode: 'HR',
    designationCode: 'REC',
    joiningOffsetDays: -900,
    managerIndex: 2,
    basicSalary: 85000,
  },
  {
    employeeCode: 'SL0008',
    firstName: 'Ananya',
    lastName: 'Prasad',
    email: 'ananya@superlink.local',
    phone: '+91 98000 00008',
    gender: Gender.FEMALE,
    role: Role.EMPLOYEE,
    password: DEFAULT_PASSWORD,
    departmentCode: 'ENG',
    designationCode: 'SSE',
    joiningOffsetDays: -820,
    managerIndex: 3,
    basicSalary: 145000,
  },
  {
    employeeCode: 'SL0009',
    firstName: 'Vikram',
    lastName: 'Singh',
    email: 'vikram@superlink.local',
    phone: '+91 98000 00009',
    gender: Gender.MALE,
    role: Role.EMPLOYEE,
    password: DEFAULT_PASSWORD,
    departmentCode: 'ENG',
    designationCode: 'SE',
    joiningOffsetDays: -640,
    managerIndex: 3,
    basicSalary: 95000,
  },
  {
    employeeCode: 'SL0010',
    firstName: 'Meera',
    lastName: 'Joshi',
    email: 'meera@superlink.local',
    phone: '+91 98000 00010',
    gender: Gender.FEMALE,
    role: Role.EMPLOYEE,
    password: DEFAULT_PASSWORD,
    departmentCode: 'ENG',
    designationCode: 'QA',
    joiningOffsetDays: -520,
    managerIndex: 3,
    basicSalary: 88000,
  },
  {
    employeeCode: 'SL0011',
    firstName: 'Arjun',
    lastName: 'Nair',
    email: 'arjun@superlink.local',
    phone: '+91 98000 00011',
    gender: Gender.MALE,
    role: Role.EMPLOYEE,
    password: DEFAULT_PASSWORD,
    departmentCode: 'ENG',
    designationCode: 'DEVOPS',
    joiningOffsetDays: -430,
    managerIndex: 3,
    basicSalary: 135000,
  },
  {
    employeeCode: 'SL0012',
    firstName: 'Pooja',
    lastName: 'Deshmukh',
    email: 'pooja@superlink.local',
    phone: '+91 98000 00012',
    gender: Gender.FEMALE,
    role: Role.EMPLOYEE,
    password: DEFAULT_PASSWORD,
    departmentCode: 'HR',
    designationCode: 'HRE',
    joiningOffsetDays: -380,
    managerIndex: 2,
    basicSalary: 62000,
  },
  {
    employeeCode: 'SL0013',
    firstName: 'Rohit',
    lastName: 'Shah',
    email: 'rohit@superlink.local',
    phone: '+91 98000 00013',
    gender: Gender.MALE,
    role: Role.EMPLOYEE,
    password: DEFAULT_PASSWORD,
    departmentCode: 'FIN',
    designationCode: 'AE',
    joiningOffsetDays: -300,
    managerIndex: 5,
    basicSalary: 58000,
  },
  {
    employeeCode: 'SL0014',
    firstName: 'Nisha',
    lastName: 'Bhatt',
    email: 'nisha@superlink.local',
    phone: '+91 98000 00014',
    gender: Gender.FEMALE,
    role: Role.EMPLOYEE,
    password: DEFAULT_PASSWORD,
    departmentCode: 'SAL',
    designationCode: 'SLE',
    joiningOffsetDays: -260,
    managerIndex: 0,
    basicSalary: 72000,
  },
  {
    employeeCode: 'SL0015',
    firstName: 'Sameer',
    lastName: 'Gupta',
    email: 'sameer@superlink.local',
    phone: '+91 98000 00015',
    gender: Gender.MALE,
    role: Role.EMPLOYEE,
    password: DEFAULT_PASSWORD,
    departmentCode: 'SAL',
    designationCode: 'SLE',
    joiningOffsetDays: -200,
    managerIndex: 0,
    basicSalary: 70000,
  },
  {
    employeeCode: 'SL0016',
    firstName: 'Lakshmi',
    lastName: 'Menon',
    email: 'lakshmi@superlink.local',
    phone: '+91 98000 00016',
    gender: Gender.FEMALE,
    role: Role.EMPLOYEE,
    password: DEFAULT_PASSWORD,
    departmentCode: 'SUP',
    designationCode: 'SUPE',
    joiningOffsetDays: -160,
    managerIndex: 4,
    basicSalary: 55000,
  },
  {
    employeeCode: 'SL0017',
    firstName: 'Aman',
    lastName: 'Kulkarni',
    email: 'aman@superlink.local',
    phone: '+91 98000 00017',
    gender: Gender.MALE,
    role: Role.EMPLOYEE,
    password: DEFAULT_PASSWORD,
    departmentCode: 'ENG',
    designationCode: 'SE',
    employmentType: EmploymentType.INTERN,
    joiningOffsetDays: -45,
    managerIndex: 3,
    basicSalary: 35000,
  },
];

export async function runSeed(): Promise<void> {
  console.log('Seeding SuperLink HRMS database...');

  const departmentMap = new Map<string, string>();
  for (const department of DEPARTMENTS) {
    const record = await prisma.department.upsert({
      where: { code: department.code },
      update: { name: department.name, description: department.description },
      create: department,
    });
    departmentMap.set(department.code, record.id);
  }
  console.log(`  departments: ${departmentMap.size}`);

  const designationMap = new Map<string, string>();
  for (const designation of DESIGNATIONS) {
    const record = await prisma.designation.upsert({
      where: { code: designation.code },
      update: { name: designation.name, level: designation.level },
      create: designation,
    });
    designationMap.set(designation.code, record.id);
  }
  console.log(`  designations: ${designationMap.size}`);

  const leaveTypeMap = new Map<string, string>();
  for (const leaveType of LEAVE_TYPES) {
    const record = await prisma.leaveType.upsert({
      where: { code: leaveType.code },
      update: {
        name: leaveType.name,
        annualQuota: leaveType.annualQuota,
        minDaysNotice: leaveType.minDaysNotice,
        description: leaveType.description,
      },
      create: {
        name: leaveType.name,
        code: leaveType.code,
        description: leaveType.description,
        annualQuota: leaveType.annualQuota,
        minDaysNotice: leaveType.minDaysNotice,
        isPaid: leaveType.isPaid ?? true,
        color: leaveType.color,
      },
    });
    leaveTypeMap.set(leaveType.code, record.id);
  }
  console.log(`  leave types: ${leaveTypeMap.size}`);

  for (const year of [CURRENT_YEAR, CURRENT_YEAR + 1]) {
    for (const holiday of holidaysForYear(year)) {
      await prisma.holiday.upsert({
        where: { name_date: { name: holiday.name, date: holiday.date } },
        update: { type: holiday.type },
        create: { name: holiday.name, date: holiday.date, type: holiday.type },
      });
    }
  }
  console.log('  holidays: created for current and next year');

  const employeeIds: string[] = [];
  const createdEmployees: { id: string; userId: string; email: string; role: Role }[] = [];

  for (const [index, entry] of EMPLOYEES.entries()) {
    const passwordHash = await bcrypt.hash(entry.password, SALT_ROUNDS);

    const employee = await prisma.employee.upsert({
      where: { employeeCode: entry.employeeCode },
      update: {
        firstName: entry.firstName,
        lastName: entry.lastName,
        email: entry.email,
        phone: entry.phone,
        departmentId: departmentMap.get(entry.departmentCode),
        designationId: designationMap.get(entry.designationCode),
        status: EmployeeStatus.ACTIVE,
      },
      create: {
        employeeCode: entry.employeeCode,
        firstName: entry.firstName,
        lastName: entry.lastName,
        email: entry.email,
        phone: entry.phone,
        gender: entry.gender,
        dateOfBirth: dayOffset(-9000 - index * 120),
        address: `${10 + index}, Tech Park Road`,
        city: 'Bengaluru',
        state: 'Karnataka',
        postalCode: '560001',
        emergencyContactName: `Emergency Contact ${index + 1}`,
        emergencyContactPhone: `+91 99000 ${String(10000 + index).slice(-5)}`,
        joiningDate: dayOffset(entry.joiningOffsetDays),
        employmentType: entry.employmentType ?? EmploymentType.FULL_TIME,
        status: EmployeeStatus.ACTIVE,
        departmentId: departmentMap.get(entry.departmentCode),
        designationId: designationMap.get(entry.designationCode),
        bankName: 'HDFC Bank',
        bankAccountNumber: `50100${String(100000000 + index * 137)}`,
        bankIfsc: 'HDFC0000123',
        panNumber: `ABCPE${String(1234 + index)}K`,
      },
    });

    employeeIds.push(employee.id);

    if (entry.isDepartmentHead) {
      await prisma.department.update({
        where: { id: departmentMap.get(entry.departmentCode) },
        data: { headId: employee.id },
      });
    }

    const user = await prisma.user.upsert({
      where: { email: entry.email },
      update: { role: entry.role, passwordHash, employeeId: employee.id, status: 'ACTIVE' },
      create: {
        email: entry.email,
        passwordHash,
        role: entry.role,
        employeeId: employee.id,
        status: 'ACTIVE',
        passwordChangedAt: new Date(),
      },
    });

    createdEmployees.push({ id: employee.id, userId: user.id, email: entry.email, role: entry.role });
  }

  for (const [index, entry] of EMPLOYEES.entries()) {
    const managerIndex = entry.managerIndex;
    if (managerIndex === undefined) continue;
    const managerId = employeeIds[managerIndex];
    if (!managerId) continue;
    await prisma.employee.update({ where: { id: employeeIds[index] }, data: { managerId } });
  }
  console.log(`  employees + users: ${createdEmployees.length}`);

  const leaveTypeIds = [...leaveTypeMap.values()];
  const balanceRows: Prisma.LeaveBalanceCreateManyInput[] = [];
  for (const employeeId of employeeIds) {
    for (const leaveTypeId of leaveTypeIds) {
      balanceRows.push({ employeeId, leaveTypeId, year: CURRENT_YEAR, allocated: 0, used: 0, pending: 0 });
    }
  }
  await prisma.leaveBalance.deleteMany({ where: { year: CURRENT_YEAR } });
  await prisma.leaveBalance.createMany({ data: balanceRows, skipDuplicates: true });

  const quotas = new Map(
    LEAVE_TYPES.map((leaveType) => [leaveType.code, leaveType.annualQuota] as const),
  );
  for (const employeeId of employeeIds) {
    for (const [code, leaveTypeId] of leaveTypeMap) {
      const quota = quotas.get(code) ?? 0;
      if (quota <= 0) continue;
      await prisma.leaveBalance.update({
        where: { employeeId_leaveTypeId_year: { employeeId, leaveTypeId, year: CURRENT_YEAR } },
        data: { allocated: quota },
      });
    }
  }
  console.log(`  leave balances: ${balanceRows.length}`);

  const holidayDates = new Set(
    (await prisma.holiday.findMany({ where: { isActive: true }, select: { date: true } })).map(
      (holiday) => holiday.date.toISOString().slice(0, 10),
    ),
  );

  const attendanceRows: Prisma.AttendanceCreateManyInput[] = [];
  for (let offset = -30; offset <= 0; offset += 1) {
    const date = dayOffset(offset);
    const isoDate = date.toISOString().slice(0, 10);
    if (holidayDates.has(isoDate)) continue;

    for (const [index, employeeId] of employeeIds.entries()) {
      if (isWeekend(date)) {
        attendanceRows.push({ employeeId, date, status: 'WEEK_OFF', source: 'SYSTEM' });
        continue;
      }

      const roll = (index * 7 + Math.abs(offset) * 3) % 23;
      if (roll === 3) {
        attendanceRows.push({ employeeId, date, status: 'ABSENT', source: 'SYSTEM' });
        continue;
      }

      const lateMinutes = roll === 5 ? 35 : ((index * 5 + Math.abs(offset)) % 12) + 4;
      const checkIn = atTime(date, 9, lateMinutes);
      const workHours = 8 + ((index + Math.abs(offset)) % 3);
      const checkOut = atTime(date, 9 + workHours, ((index * 3 + Math.abs(offset)) % 50) - 20);
      const totalMinutes = Math.max(60, Math.round((checkOut.getTime() - checkIn.getTime()) / 60000));

      attendanceRows.push({
        employeeId,
        date,
        checkIn,
        checkOut,
        totalMinutes,
        status: roll === 5 ? 'LATE' : 'PRESENT',
        source: 'MANUAL',
      });
    }
  }
  await prisma.attendance.createMany({ data: attendanceRows, skipDuplicates: true });
  console.log(`  attendance records: ${attendanceRows.length}`);

  const casualLeaveId = leaveTypeMap.get('CL');
  const earnedLeaveId = leaveTypeMap.get('EL');
  const sickLeaveId = leaveTypeMap.get('SL');
  if (casualLeaveId && earnedLeaveId && sickLeaveId) {
    const employeeAt = (index: number): string => {
      const value = employeeIds[index];
      if (!value) throw new Error(`Seed employee at index ${index} is missing`);
      return value;
    };

    const hrManagerId = employeeAt(2);
    const engineeringManagerId = employeeAt(3);
    const hrAdminUser = createdEmployees.find((entry) => entry.email === HR_ADMIN_EMAIL);

    await prisma.leaveRequest.deleteMany({
      where: { employeeId: { in: employeeIds }, appliedAt: { gte: dayOffset(0) } },
    });

    const leaveRows: Prisma.LeaveRequestCreateManyInput[] = [
      {
        employeeId: employeeAt(7),
        leaveTypeId: earnedLeaveId,
        startDate: dayOffset(12),
        endDate: dayOffset(14),
        totalDays: 3,
        reason: 'Family function out of town',
        status: 'PENDING',
        managerId: engineeringManagerId,
      },
      {
        employeeId: employeeAt(8),
        leaveTypeId: casualLeaveId,
        startDate: dayOffset(5),
        endDate: dayOffset(5),
        totalDays: 1,
        reason: 'Personal appointment',
        status: 'PENDING',
        managerId: engineeringManagerId,
      },
      {
        employeeId: employeeAt(11),
        leaveTypeId: casualLeaveId,
        startDate: dayOffset(20),
        endDate: dayOffset(21),
        totalDays: 2,
        reason: 'Travel',
        status: 'PENDING',
        managerId: hrManagerId,
      },
      {
        employeeId: employeeAt(15),
        leaveTypeId: sickLeaveId,
        startDate: dayOffset(-8),
        endDate: dayOffset(-7),
        totalDays: 2,
        reason: 'Medical leave',
        status: 'APPROVED',
        managerId: engineeringManagerId,
        managerStage: 'APPROVED',
        managerActionAt: dayOffset(-9),
        hrApproverId: hrAdminUser?.userId ?? null,
        hrStage: 'APPROVED',
        hrActionAt: dayOffset(-9),
      },
    ];
    await prisma.leaveRequest.createMany({ data: leaveRows, skipDuplicates: true });

    for (const request of leaveRows) {
      if (request.employeeId && request.leaveTypeId) {
        await prisma.leaveBalance.update({
          where: {
            employeeId_leaveTypeId_year: {
              employeeId: request.employeeId,
              leaveTypeId: request.leaveTypeId,
              year: CURRENT_YEAR,
            },
          },
          data: { pending: { increment: request.totalDays ?? 0 } },
        });
      }
    }
    console.log(`  leave requests: ${leaveRows.length}`);
  }

  // Salary structures. Deterministic bands keep demo payroll stable across reseeds.
  const salaryRows: Prisma.SalaryStructureCreateManyInput[] = [];
  const BANDS = [
    { min: 90000, basic: 45000, hra: 18000, transport: 3200, medical: 1500, other: 1200, pf: 5400, esi: 0, professionalTax: 200 },
    { min: 60000, basic: 30000, hra: 12000, transport: 2500, medical: 1250, other: 900, pf: 3600, esi: 0, professionalTax: 200 },
    { min: 45000, basic: 22500, hra: 9000, transport: 2000, medical: 1000, other: 700, pf: 2700, esi: 300, professionalTax: 200 },
    { min: 30000, basic: 15000, hra: 6000, transport: 1600, medical: 750, other: 500, pf: 1800, esi: 187.5, professionalTax: 150 },
    { min: 0, basic: 8000, hra: 3200, transport: 800, medical: 500, other: 300, pf: 960, esi: 98.75, professionalTax: 0 },
  ];

  for (const [index, employee] of createdEmployees.entries()) {
    const band = BANDS[index % BANDS.length];
    if (!band) throw new Error('Seed salary band is missing');
    const gross = band.basic + band.hra + band.transport + band.medical + band.other;
    const deductions = band.pf + band.esi + band.professionalTax;

    salaryRows.push({
      employeeId: employee.id,
      effectiveFrom: utcDate(new Date(Date.UTC(CURRENT_YEAR, 0, 1))),
      basicSalary: band.basic,
      hra: band.hra,
      transportAllowance: band.transport,
      medicalAllowance: band.medical,
      otherAllowance: band.other,
      grossSalary: gross,
      pf: band.pf,
      esi: band.esi,
      professionalTax: band.professionalTax,
      tds: 0,
      otherDeduction: 0,
      netSalary: gross - deductions,
      isActive: true,
      createdById: employee.userId,
    });
  }

  await prisma.salaryStructure.deleteMany({ where: { employeeId: { in: employeeIds } } });
  await prisma.salaryStructure.createMany({ data: salaryRows, skipDuplicates: true });
  console.log(`  salary structures: ${salaryRows.length}`);

  console.log('\nSeed complete. Development credentials:');
  for (const entry of createdEmployees) {
    console.log(`  ${entry.role.padEnd(11)} ${entry.email}`);
  }
  console.log('\nPasswords come from SEED_* environment variables (see server/.env).');
}

if (require.main === module) {
  runSeed()
    .catch((error: unknown) => {
      console.error('Seed failed:', error);
      process.exitCode = 1;
    })
    .finally(() => {
      void prisma.$disconnect();
    });
}
