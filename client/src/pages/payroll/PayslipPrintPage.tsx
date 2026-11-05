import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Printer } from 'lucide-react';
import { useEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { CompanyLogo } from '@/components/ui/CompanyLogo';
import { useAuthStore } from '@/stores/auth.store';
import { getPayslipPrint, getPayslipPrintSheet } from '@/services/payroll.service';
import type { PayslipPrint, PayslipPrintSheet } from '@/types/payroll';

const money = (value: number): string =>
  value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const dateLabel = (value: string): string => {
  const [year, month, day] = value.slice(0, 10).split('-');
  return `${day}/${month}/${year}`;
};

const ONES = [
  '',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen',
];

const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function twoDigits(value: number): string {
  if (value < 20) return ONES[value] ?? '';
  const tens = TENS[Math.floor(value / 10)] ?? '';
  const ones = value % 10 ? ` ${ONES[value % 10]}` : '';
  return `${tens}${ones}`;
}

function threeDigits(value: number): string {
  const hundred = Math.floor(value / 100);
  const rest = value % 100;
  const parts: string[] = [];
  if (hundred) parts.push(`${ONES[hundred]} Hundred`);
  if (rest) parts.push(twoDigits(rest));
  return parts.join(' ');
}

function indianWords(value: number): string {
  if (value === 0) return 'Zero';
  let remaining = value;
  const crore = Math.floor(remaining / 10000000);
  remaining %= 10000000;
  const lakh = Math.floor(remaining / 100000);
  remaining %= 100000;
  const thousand = Math.floor(remaining / 1000);
  remaining %= 1000;

  const parts: string[] = [];
  if (crore) parts.push(`${indianWords(crore)} Crore`);
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
  if (remaining) parts.push(threeDigits(remaining));
  return parts.join(' ');
}

function amountInWords(value: number): string {
  const rupees = Math.floor(value);
  const paise = Math.round((value - rupees) * 100);
  let result = `Rupees ${indianWords(rupees)}`;
  if (paise > 0) result += ` and ${twoDigits(paise)} Paise`;
  return `${result} Only`;
}

const COMPANY = {
  name: 'SuperLink IT Services Private Limited',
  address: ['1st floor, Thimmaiah complex, Immadihalli main road,', 'Next to Bescom office, Whitefield, Bangalore - 560066'],
};

export function PayslipPrintPage() {
  const { id } = useParams<{ id: string }>();
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((state) => Boolean(state.user));

  // The app prints timesheets in landscape. A payslip is a portrait document, so
  // this route adds a later @page rule that wins while the page is mounted.
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = '@media print { @page { size: A4 portrait; margin: 10mm; } }';
    document.head.appendChild(style);
    return () => {
      style.remove();
    };
  }, []);

  const year = search.get('year') ?? '';
  const month = search.get('month') ?? '';
  const employeeId = search.get('employeeId') ?? undefined;
  const isBulk = !id;

  const query = useQuery<PayslipPrint | PayslipPrintSheet>({
    queryKey: ['payslip-print', id ?? `${year}-${month}-${employeeId ?? 'all'}`],
    queryFn: () =>
      id
        ? getPayslipPrint(id)
        : getPayslipPrintSheet({ year, month, employeeId }),
    enabled: isAuthenticated && (Boolean(id) || (Boolean(year) && Boolean(month))),
    refetchOnWindowFocus: false,
    staleTime: 5 * 60_000,
  });

  const sheet = isBulk ? (query.data as PayslipPrintSheet | undefined) : undefined;
  const items: PayslipPrint[] = id
    ? query.data
      ? [query.data as PayslipPrint]
      : []
    : (sheet?.items ?? []);

  return (
    <div className="min-h-screen bg-slate-100 py-6 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex w-[210mm] max-w-full items-center justify-between gap-3 px-2 print:hidden">
        <Button variant="secondary" leftIcon={<ArrowLeft className="h-4 w-4" />} onClick={() => navigate('/payroll/payslips')}>
          Back
        </Button>
        <div className="flex items-center gap-3">
          {isBulk && sheet ? (
            <span className="text-sm text-slate-600">
              {sheet.count} payslip{sheet.count === 1 ? '' : 's'} · {sheet.period.monthLabel}
            </span>
          ) : null}
          <Button leftIcon={<Printer className="h-4 w-4" />} onClick={() => window.print()} disabled={items.length === 0}>
            Print
          </Button>
        </div>
      </div>

      {!isAuthenticated ? (
        <Notice message="Sign in to view this payslip." />
      ) : !id && (!year || !month) ? (
        <Notice message="Choose a month before printing payslips." />
      ) : query.isPending ? (
        <Notice message="Preparing payslip…" />
      ) : query.isError ? (
        <Notice message={query.error instanceof Error ? query.error.message : 'Could not load the payslip.'} />
      ) : items.length === 0 ? (
        <Notice message="No payslips were generated for this month." />
      ) : (
        items.map((item) => <PayslipSheet key={item.id} payslip={item} />)
      )}
    </div>
  );
}

function Notice({ message }: { message: string }) {
  return (
    <div className="mx-auto w-[210mm] max-w-full px-2 print:hidden">
      <div className="rounded-lg bg-white p-10 text-center text-sm text-slate-600 shadow-sm ring-1 ring-slate-200">
        {message}
      </div>
    </div>
  );
}

function PayslipSheet({ payslip }: { payslip: PayslipPrint }) {
  const employee = payslip.employee;
  const fullName = [employee.firstName, employee.middleName, employee.lastName].filter(Boolean).join(' ');

  const earnings: Array<[string, number]> = [
    ['Basic Salary', payslip.basicSalary],
    ['HRA', payslip.hra],
    ['Transport Allowance', payslip.transportAllowance],
    ['Medical Allowance', payslip.medicalAllowance],
    ['Other Allowance', payslip.otherAllowance],
  ];

  const deductions: Array<[string, number]> = [
    ['PF', payslip.pf],
    ['ESI', payslip.esi],
    ['Professional Tax', payslip.professionalTax],
    ['TDS', payslip.tds],
    ['Other Deduction', payslip.otherDeduction],
  ];

  const rowCount = Math.max(earnings.length, deductions.length);

  const leftDayRows: Array<[string, string | number]> = [
    ['Total Days', payslip.days.totalDays],
    ['Paid Holidays', payslip.days.paidHolidays],
    ['LWP', payslip.days.lwp],
    ['Paid Leaves', payslip.days.paidLeaves],
    ['Net Paid Days', payslip.days.netPaidDays],
  ];

  const rightDayRows: Array<[string, string | number]> = [
    ['Weekly Off (Sat & Sun)', payslip.days.weeklyOff],
    ['Working Days', payslip.days.workingDays],
    ['Present Days', payslip.days.presentDays],
    ['Maximum Payable Days', payslip.days.maximumPayableDays],
    ['New Joiner Arrear Days', payslip.newJoinerArrearDays],
  ];

  const employeeRows: Array<[string, string, string, string]> = [
    ['Employee Name', fullName, 'Code', employee.employeeCode],
    ['DOJ', dateLabel(employee.joiningDate), 'PAN', employee.panNumber ?? ''],
    ['Bank A/c No.', employee.bankAccountNumber ?? '', 'ESI A/c No.', employee.esiNumber ?? ''],
    ['Department', employee.department?.name ?? '', 'Designation', employee.designation?.name ?? ''],
    ['Pay Mode', employee.payMode ?? '', 'Bank Name', employee.bankName ?? ''],
    ['PF Number', employee.pfNumber ?? '', 'UAN', employee.uan ?? ''],
    ['LOP', String(payslip.days.lop), '', ''],
  ];

  return (
    <div className="payslip-sheet mx-auto mb-6 w-[210mm] min-h-[297mm] max-w-full bg-white px-[14mm] py-[12mm] text-[11px] leading-tight text-black shadow-md ring-1 ring-slate-300 print:mb-0 print:min-h-0 print:w-auto print:px-0 print:py-0 print:shadow-none print:ring-0">
      <header className="relative pb-1 text-center">
        <div className="absolute right-0 top-0">
          <CompanyLogo className="h-[24mm] w-[24mm]" alt="SuperLink logo" />
        </div>
        <h1 className="pt-4 text-[20px] font-bold tracking-tight">{COMPANY.name}</h1>
        {COMPANY.address.map((line) => (
          <p key={line} className="mt-1 text-[11px] font-semibold">
            {line}
          </p>
        ))}
      </header>

      <p className="mb-2 mt-5 text-[11px]">
        PAYSLIP FOR THE MONTH OF <span className="font-semibold">{payslip.period.monthLabel}</span>
        <span className="ml-3">
          (From <span className="font-semibold">{dateLabel(payslip.period.fromDate)}</span> To{' '}
          <span className="font-semibold">{dateLabel(payslip.period.toDate)}</span>)
        </span>
      </p>

      <section className="border border-black px-2 py-2">
        <div className="grid gap-x-10 sm:grid-cols-2">
          <div className="space-y-1.5">
            {leftDayRows.map(([label, value]) => (
              <Field key={label} label={label} value={value} />
            ))}
          </div>
          <div className="space-y-1.5">
            {rightDayRows.map(([label, value]) => (
              <Field key={label} label={label} value={value} />
            ))}
          </div>
        </div>
      </section>

      <section className="border border-t-0 border-black px-2 py-2">
        <div className="grid gap-x-10 sm:grid-cols-2">
          <div className="space-y-1.5">
            {employeeRows.map(([label, value]) => (
              <Field key={label} label={label} value={value} />
            ))}
          </div>
          <div className="space-y-1.5">
            {employeeRows.map(([, , rightLabel, rightValue]) =>
              rightLabel ? <Field key={rightLabel} label={rightLabel} value={rightValue} /> : null,
            )}
          </div>
        </div>
      </section>

      <table className="mt-4 w-full table-fixed border-collapse border border-black text-[11px]">
        <colgroup>
          <col className="w-[32%]" />
          <col className="w-[10%]" />
          <col className="w-[16%]" />
          <col className="w-[26%]" />
          <col className="w-[16%]" />
        </colgroup>
        <thead>
          <tr>
            <th className="border-b border-black px-2 py-1 text-left font-bold">Earnings</th>
            <th className="border-b border-r border-black px-2 py-1 text-right font-bold">Arrear</th>
            <th className="border-b border-r border-black px-2 py-1 text-right font-bold">Amount</th>
            <th className="border-b border-r border-black px-2 py-1 text-left font-bold">Deductions</th>
            <th className="border-b border-black px-2 py-1 text-right font-bold">Amount</th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rowCount }).map((_, index) => {
            const earning = earnings[index];
            const deduction = deductions[index];
            return (
              <tr key={index}>
                <td className="px-2 py-1">{earning?.[0] ?? ''}</td>
                <td className="px-2 py-1 text-right">{earning ? money(0) : ''}</td>
                <td className="border-r border-black px-2 py-1 text-right">
                  {earning ? money(earning[1]) : ''}
                </td>
                <td className="border-r border-black px-2 py-1">{deduction?.[0] ?? ''}</td>
                <td className="px-2 py-1 text-right">{deduction ? money(deduction[1]) : ''}</td>
              </tr>
            );
          })}
          <tr>
            <td colSpan={5} className="h-[120px]" />
          </tr>
          <tr className="border-t border-black font-bold">
            <td className="px-2 py-1" colSpan={2}>
              Total Earnings
            </td>
            <td className="border-r border-black px-2 py-1 text-right">{money(payslip.grossSalary)}</td>
            <td className="border-r border-black px-2 py-1">Total Deductions</td>
            <td className="px-2 py-1 text-right">{money(payslip.totalDeductions)}</td>
          </tr>
        </tbody>
      </table>

      <section className="mt-4 border border-black text-[11px]">
        <div className="flex items-center justify-between border-b border-black px-2 py-1 font-bold">
          <span>REIMBURSEMENTS</span>
          <span>AMOUNT</span>
        </div>
        <div className="grid grid-cols-[58%_42%]">
          <div className="border-r border-black">
            <div className="px-2 py-1">TELEPHONE REIMBURSEMENT</div>
            <div className="px-2 py-1">LTA REIMBURSEMENT</div>
          </div>
          <div>
            <div className="px-2 py-1 text-right">{money(payslip.reimbursements.telephone)}</div>
            <div className="px-2 py-1 text-right">{money(payslip.reimbursements.lta)}</div>
          </div>
        </div>
        <div className="flex items-center justify-between border-t border-black px-2 py-1 font-bold">
          <span>TOTAL REIMBURSEMENT</span>
          <span>{money(payslip.reimbursements.total)}</span>
        </div>
        <div className="flex items-center border-t border-black px-2 py-1">
          <span className="w-[34%] font-bold">NET TRANSFER</span>
          <span>:</span>
          <span className="ml-auto font-bold">{money(payslip.netSalary)}</span>
        </div>
        <div className="flex items-start border-t border-black px-2 py-1">
          <span className="w-[34%] shrink-0 font-bold">IN WORDS</span>
          <span>:</span>
          <span className="ml-2">{amountInWords(payslip.netSalary)}</span>
        </div>
      </section>

      <div className="border border-t-0 border-black px-2 py-4 text-right text-[11px] font-semibold">
        <p>Computer generated payslip,</p>
        <p>Employer signature not required</p>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="w-[46%] shrink-0 font-bold">{label}</span>
      <span className="shrink-0">:</span>
      <span className="truncate">{value}</span>
    </div>
  );
}
