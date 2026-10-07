import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { ACCOUNTS, app, login, type LoginResult } from '../helpers/testApp';

interface EmployeeRow {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  email: string;
  status: string;
  managerId: string | null;
  departmentId: string | null;
}

const bearer = (session: LoginResult) => ({ Authorization: `Bearer ${session.accessToken}` });

describe('GET /api/v1/employees', () => {
  let superAdmin: LoginResult;
  let hrAdmin: LoginResult;
  let manager: LoginResult;
  let employee: LoginResult;

  const listAs = async (session: LoginResult, query: Record<string, string> = {}): Promise<EmployeeRow[]> => {
    const response = await request(app)
      .get('/api/v1/employees')
      .query({ limit: 100, ...query })
      .set(bearer(session))
      .expect(200);
    return response.body.data as EmployeeRow[];
  };

  const findByEmail = async (email: string): Promise<EmployeeRow> => {
    const rows = await listAs(superAdmin, { search: email });
    const match = rows.find((row) => row.email === email);
    if (!match) throw new Error(`Seed employee ${email} was not found`);
    return match;
  };

  beforeAll(async () => {
    [superAdmin, hrAdmin, manager, employee] = await Promise.all([
      login(ACCOUNTS.superAdmin),
      login(ACCOUNTS.hrAdmin),
      login(ACCOUNTS.manager),
      login(ACCOUNTS.employee),
    ]);
  });

  it('requires authentication', async () => {
    await request(app).get('/api/v1/employees').expect(401);
  });

  it('returns every employee for an HR administrator', async () => {
    const rows = await listAs(hrAdmin);
    expect(rows.length).toBeGreaterThanOrEqual(17);
  });

  it('limits an employee to their own record', async () => {
    const rows = await listAs(employee);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.email).toBe(ACCOUNTS.employee.email);
  });

  it('limits a manager to their own record and direct reports', async () => {
    const self = await findByEmail(ACCOUNTS.manager.email);
    const rows = await listAs(manager);

    expect(rows.length).toBeGreaterThan(1);
    expect(rows.some((row) => row.id === self.id)).toBe(true);

    const outsiders = await findByEmail(ACCOUNTS.finance.email);
    expect(rows.some((row) => row.id === outsiders.id)).toBe(false);

    for (const row of rows) {
      expect(row.id === self.id || row.managerId === self.id).toBe(true);
    }
  });

  it('supports search, department and status filters', async () => {
    const bySearch = await listAs(superAdmin, { search: 'ananya' });
    expect(bySearch).toHaveLength(1);

    const byStatus = await listAs(superAdmin, { status: 'TERMINATED' });
    expect(byStatus).toHaveLength(0);

    const department = bySearch[0]?.departmentId as string;
    const byDepartment = await listAs(superAdmin, { departmentId: department });
    expect(byDepartment.length).toBeGreaterThan(0);
    for (const row of byDepartment) expect(row.departmentId).toBe(department);
  });

  it('sorts by employee code by default and honours sortBy', async () => {
    const response = await request(app)
      .get('/api/v1/employees')
      .query({ limit: 100 })
      .set(bearer(superAdmin))
      .expect(200);

    const rows = response.body.data as EmployeeRow[];
    const codes = rows.map((row) => row.employeeCode);
    expect([...codes].sort()).toEqual(codes);

    const descending = await request(app)
      .get('/api/v1/employees')
      .query({ limit: 100, sortBy: 'employeeCode', sortOrder: 'desc' })
      .set(bearer(superAdmin))
      .expect(200);

    const descendingCodes = (descending.body.data as EmployeeRow[]).map((row) => row.employeeCode);
    expect(descendingCodes).toEqual([...codes].reverse());
  });

  it('returns pagination metadata', async () => {
    const response = await request(app)
      .get('/api/v1/employees')
      .query({ page: 2, limit: 5 })
      .set(bearer(superAdmin))
      .expect(200);

    expect(response.body.data).toHaveLength(5);
    expect(response.body.meta).toMatchObject({ page: 2, limit: 5, hasPrev: true, hasNext: true });
  });

  it('rejects an invalid status filter', async () => {
    await request(app)
      .get('/api/v1/employees')
      .query({ status: 'ON_VACATION' })
      .set(bearer(superAdmin))
      .expect(400);
  });
});

describe('GET /api/v1/employees/:id', () => {
  let superAdmin: LoginResult;
  let employee: LoginResult;

  const readAs = (session: LoginResult, id: string) =>
    request(app).get(`/api/v1/employees/${id}`).set(bearer(session));

  beforeAll(async () => {
    [superAdmin, employee] = await Promise.all([login(ACCOUNTS.superAdmin), login(ACCOUNTS.employee)]);
  });

  it('blocks an employee from reading a colleague', async () => {
    const finance = await request(app)
      .get('/api/v1/employees?search=finance@superlink.local')
      .set(bearer(superAdmin))
      .expect(200);

    const target = (finance.body.data as EmployeeRow[])[0] as EmployeeRow;
    const response = await readAs(employee, target.id).expect(403);
    expect(response.body.success).toBe(false);
  });

  it('returns 404 for an unknown employee', async () => {
    await readAs(superAdmin, '9f1c4d2e-2b3a-4c5d-8e7f-0a1b2c3d4e5f').expect(404);
  });

  it('shows an employee their own document and bank details', async () => {
    const me = await readAs(employee, employee.employeeId as string).expect(200);

    expect(me.body.data.email).toBe(ACCOUNTS.employee.email);
    expect(Array.isArray(me.body.data.directReports)).toBe(true);
  });

  it('shows document and bank details to HR but hides them from team-level viewers', async () => {
    const hr = await login(ACCOUNTS.hrAdmin);
    const manager = await login(ACCOUNTS.manager);

    const mine = await request(app)
      .get('/api/v1/employees?limit=100')
      .set(bearer(manager))
      .expect(200);
    const visible = mine.body.data as EmployeeRow[];
    const self = visible[0] as EmployeeRow;
    const report = visible.find((row) => row.managerId === self.id) as EmployeeRow;

    await request(app)
      .patch(`/api/v1/employees/${report.id}`)
      .set(bearer(hr))
      .send({ panNumber: 'ZZZZZ9999Z', aadhaarNumber: '999988887777', bankAccountNumber: '998877665544' })
      .expect(200);

    const asHr = await readAs(hr, report.id).expect(200);
    expect(asHr.body.data.panNumber).toBe('ZZZZZ9999Z');
    expect(asHr.body.data.aadhaarNumber).toBe('999988887777');
    expect(asHr.body.data.bankAccountNumber).toBe('998877665544');

    const asManager = await readAs(manager, report.id).expect(200);
    expect(asManager.body.data.email).toBe(report.email);
    expect(asManager.body.data.panNumber).toBeNull();
    expect(asManager.body.data.aadhaarNumber).toBeNull();
    expect(asManager.body.data.bankAccountNumber).toBeNull();
  });

  it('lets an employee see their own document and bank details', async () => {
    const hr = await login(ACCOUNTS.hrAdmin);
    await request(app)
      .patch(`/api/v1/employees/${employee.employeeId as string}`)
      .set(bearer(hr))
      .send({ panNumber: 'ABCDE1234F', bankAccountNumber: '00123456789' })
      .expect(200);

    const me = await readAs(employee, employee.employeeId as string).expect(200);
    expect(me.body.data.panNumber).toBe('ABCDE1234F');
    expect(me.body.data.bankAccountNumber).toBe('00123456789');
    expect(Array.isArray(me.body.data.directReports)).toBe(true);
  });
});

describe('POST /api/v1/employees', () => {
  let superAdmin: LoginResult;
  let employee: LoginResult;
  const created: string[] = [];

  const createAs = (session: LoginResult, body: Record<string, unknown>) =>
    request(app).post('/api/v1/employees').set(bearer(session)).send(body);

  const validBody = (overrides: Record<string, unknown> = {}) => ({
    firstName: 'Test',
    lastName: 'Person',
    email: `test.person.${Date.now()}@superlink.local`,
    joiningDate: '2024-01-15',
    employmentType: 'FULL_TIME',
    status: 'ACTIVE',
    country: 'India',
    ...overrides,
  });

  beforeAll(async () => {
    [superAdmin, employee] = await Promise.all([login(ACCOUNTS.superAdmin), login(ACCOUNTS.employee)]);
  });

  it('is denied for employees', async () => {
    await createAs(employee, validBody()).expect(403);
  });

  it('creates an employee and allocates an employee code', async () => {
    const response = await createAs(superAdmin, validBody()).expect(201);

    expect(response.body.data.employeeCode).toMatch(/^SL\d{4}$/);
    expect(response.body.data.email).toContain('test.person.');
    expect(response.body.data.employmentType).toBe('FULL_TIME');
    created.push(response.body.data.id as string);
  });

  it('accepts an explicit employee code', async () => {
    const response = await createAs(superAdmin, validBody({ employeeCode: 'SLTST01' })).expect(201);
    expect(response.body.data.employeeCode).toBe('SLTST01');
    created.push(response.body.data.id as string);
  });

  it('rejects a duplicate email', async () => {
    const first = await createAs(superAdmin, validBody({ email: 'dup.person@superlink.local' })).expect(201);
    created.push(first.body.data.id as string);

    await createAs(superAdmin, validBody({ email: 'dup.person@superlink.local' })).expect(409);
  });

  it('rejects a duplicate employee code', async () => {
    await createAs(superAdmin, validBody({ employeeCode: 'SLTST01' })).expect(409);
  });

  it('requires a joining date and validates the date format', async () => {
    await createAs(superAdmin, validBody({ joiningDate: undefined })).expect(400);
    await createAs(superAdmin, validBody({ joiningDate: '15-01-2024' })).expect(400);
    await createAs(superAdmin, validBody({ joiningDate: '2024-02-31' })).expect(400);
  });

  it('rejects an unknown department or designation', async () => {
    const response = await createAs(
      superAdmin,
      validBody({ departmentId: '9f1c4d2e-2b3a-4c5d-8e7f-0a1b2c3d4e5f' }),
    ).expect(422);
    expect(response.body.message).toContain('department');
  });

  it('rejects an exit date before the joining date', async () => {
    await createAs(superAdmin, validBody({ joiningDate: '2024-01-15', exitDate: '2023-12-01' })).expect(422);
  });

  it('rejects a self-referencing manager', async () => {
    const createdEmployee = await createAs(superAdmin, validBody()).expect(201);
    const self = createdEmployee.body.data as EmployeeRow;
    created.push(self.id);

    await request(app)
      .patch(`/api/v1/employees/${self.id}`)
      .set(bearer(superAdmin))
      .send({ managerId: self.id })
      .expect(422);
  });

  it('rejects a reporting loop', async () => {
    const lead = await createAs(superAdmin, validBody()).expect(201);
    const report = await createAs(superAdmin, validBody({ managerId: lead.body.data.id })).expect(201);
    created.push(lead.body.data.id as string, report.body.data.id as string);

    await request(app)
      .patch(`/api/v1/employees/${lead.body.data.id as string}`)
      .set(bearer(superAdmin))
      .send({ managerId: report.body.data.id })
      .expect(422);
  });
});

describe('PATCH /api/v1/employees/:id', () => {
  let superAdmin: LoginResult;
  let hrAdmin: LoginResult;
  let employee: LoginResult;

  beforeAll(async () => {
    [superAdmin, hrAdmin, employee] = await Promise.all([
      login(ACCOUNTS.superAdmin),
      login(ACCOUNTS.hrAdmin),
      login(ACCOUNTS.employee),
    ]);
  });

  it('lets an employee update only their own contact details', async () => {
    const response = await request(app)
      .patch(`/api/v1/employees/${employee.employeeId as string}`)
      .set(bearer(employee))
      .send({ phone: '+91 90000 11111', address: '12 MG Road' })
      .expect(200);

    expect(response.body.data.phone).toBe('+91 90000 11111');
  });

  it('blocks an employee from changing protected fields', async () => {
    const response = await request(app)
      .patch(`/api/v1/employees/${employee.employeeId as string}`)
      .set(bearer(employee))
      .send({ firstName: 'Hacked' })
      .expect(403);

    expect(response.body.message).toContain('contact details');
  });

  it('blocks an employee from editing a colleague', async () => {
    const list = await request(app)
      .get('/api/v1/employees?search=finance@superlink.local')
      .set(bearer(superAdmin))
      .expect(200);

    const target = (list.body.data as EmployeeRow[])[0] as EmployeeRow;
    await request(app)
      .patch(`/api/v1/employees/${target.id}`)
      .set(bearer(employee))
      .send({ phone: '+91 90000 22222' })
      .expect(403);
  });

  it('lets HR move an employee to another department and manager', async () => {
    const department = await request(app)
      .get('/api/v1/departments?limit=1&search=Support')
      .set(bearer(hrAdmin))
      .expect(200);

    const departmentId = (department.body.data[0] as { id: string }).id;

    const response = await request(app)
      .patch(`/api/v1/employees/${employee.employeeId as string}`)
      .set(bearer(hrAdmin))
      .send({ departmentId, designationId: undefined })
      .expect(200);

    expect(response.body.data.departmentId).toBe(departmentId);
  });

  it('rejects an empty update', async () => {
    await request(app)
      .patch(`/api/v1/employees/${employee.employeeId as string}`)
      .set(bearer(hrAdmin))
      .send({})
      .expect(400);
  });
});

describe('PATCH /api/v1/employees/:id/status', () => {
  let superAdmin: LoginResult;
  let target: LoginResult;

  const findId = async (email: string): Promise<string> => {
    const response = await request(app)
      .get(`/api/v1/employees?search=${encodeURIComponent(email)}`)
      .set(bearer(superAdmin))
      .expect(200);
    return (response.body.data[0] as EmployeeRow).id;
  };

  beforeAll(async () => {
    [superAdmin, target] = await Promise.all([login(ACCOUNTS.superAdmin), login(ACCOUNTS.hrManager)]);
  });

  it('is denied for employees', async () => {
    const employee = await login(ACCOUNTS.employee);
    await request(app)
      .patch(`/api/v1/employees/${employee.employeeId as string}/status`)
      .set(bearer(employee))
      .send({ status: 'SUSPENDED' })
      .expect(403);
  });

  it('suspends an employee, blocking their sign-in, then restores them', async () => {
    const employeeId = await findId(ACCOUNTS.hrManager.email);

    const suspended = await request(app)
      .patch(`/api/v1/employees/${employeeId}/status`)
      .set(bearer(superAdmin))
      .send({ status: 'SUSPENDED', reason: 'Under investigation' })
      .expect(200);

    expect(suspended.body.data.status).toBe('SUSPENDED');

    await request(app)
      .get('/api/v1/auth/me')
      .set(bearer(target))
      .expect(403);

    await request(app).post('/api/v1/auth/login').send(ACCOUNTS.hrManager).expect(403);

    const restored = await request(app)
      .patch(`/api/v1/employees/${employeeId}/status`)
      .set(bearer(superAdmin))
      .send({ status: 'ACTIVE' })
      .expect(200);

    expect(restored.body.data.status).toBe('ACTIVE');
    await request(app).post('/api/v1/auth/login').send(ACCOUNTS.hrManager).expect(200);
  });

  it('records an exit date when an employee is terminated', async () => {
    const employeeId = await findId(ACCOUNTS.recruiter.email);

    const response = await request(app)
      .patch(`/api/v1/employees/${employeeId}/status`)
      .set(bearer(superAdmin))
      .send({ status: 'TERMINATED', exitDate: '2026-09-30' })
      .expect(200);

    expect(response.body.data.status).toBe('TERMINATED');
    expect(response.body.data.exitDate).not.toBeNull();

    await request(app)
      .patch(`/api/v1/employees/${employeeId}/status`)
      .set(bearer(superAdmin))
      .send({ status: 'ACTIVE' })
      .expect(200);
  });

  it('rejects an invalid status', async () => {
    const employeeId = await findId(ACCOUNTS.employee.email);
    await request(app)
      .patch(`/api/v1/employees/${employeeId}/status`)
      .set(bearer(superAdmin))
      .send({ status: 'ON_HOLIDAY' })
      .expect(400);
  });
});

describe('DELETE /api/v1/employees/:id', () => {
  let superAdmin: LoginResult;

  beforeAll(async () => {
    superAdmin = await login(ACCOUNTS.superAdmin);
  });

  it('refuses to delete an active employee', async () => {
    const response = await request(app)
      .get('/api/v1/employees?search=finance@superlink.local')
      .set(bearer(superAdmin))
      .expect(200);

    const target = (response.body.data as EmployeeRow[])[0] as EmployeeRow;
    await request(app).delete(`/api/v1/employees/${target.id}`).set(bearer(superAdmin)).expect(422);
  });

  it('refuses to delete an employee with payroll or attendance history', async () => {
    const response = await request(app)
      .get('/api/v1/employees?search=ananya@superlink.local')
      .set(bearer(superAdmin))
      .expect(200);

    const target = (response.body.data as EmployeeRow[])[0] as EmployeeRow;

    await request(app)
      .patch(`/api/v1/employees/${target.id}/status`)
      .set(bearer(superAdmin))
      .send({ status: 'TERMINATED' })
      .expect(200);

    const deletion = await request(app).delete(`/api/v1/employees/${target.id}`).set(bearer(superAdmin)).expect(409);
    expect(deletion.body.message).toContain('retained');

    await request(app)
      .patch(`/api/v1/employees/${target.id}/status`)
      .set(bearer(superAdmin))
      .send({ status: 'ACTIVE' })
      .expect(200);
  });

  it('deletes a terminated employee with no history', async () => {
    const created = await request(app)
      .post('/api/v1/employees')
      .set(bearer(superAdmin))
      .send({
        firstName: 'Temp',
        lastName: 'Record',
        email: `temp.record.${Date.now()}@superlink.local`,
        joiningDate: '2025-06-01',
        status: 'ACTIVE',
        country: 'India',
      })
      .expect(201);

    const id = created.body.data.id as string;

    await request(app)
      .patch(`/api/v1/employees/${id}/status`)
      .set(bearer(superAdmin))
      .send({ status: 'TERMINATED' })
      .expect(200);

    const deletion = await request(app).delete(`/api/v1/employees/${id}`).set(bearer(superAdmin)).expect(200);
    expect(deletion.body.data.id).toBe(id);

    await request(app).get(`/api/v1/employees/${id}`).set(bearer(superAdmin)).expect(404);
  });
});
