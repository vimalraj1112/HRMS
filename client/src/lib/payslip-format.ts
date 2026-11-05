export const formatPayslipMoney = (value: number): string =>
  value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const formatPayslipDate = (value: string): string => {
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

export function amountInWords(value: number): string {
  const rupees = Math.floor(value);
  const paise = Math.round((value - rupees) * 100);
  let result = `Rupees ${indianWords(rupees)}`;
  if (paise > 0) result += ` and ${twoDigits(paise)} Paise`;
  return `${result} Only`;
}

export function payslipFileName(payslip: {
  employee: { employeeCode: string };
  period: { monthLabel: string };
}): string {
  const name = `${payslip.employee.employeeCode}-${payslip.period.monthLabel}`
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '');
  return `${name}.pdf`;
}

export function payslipBatchFileName(monthLabel: string): string {
  const name = `payslips-${monthLabel}`.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '');
  return `${name}.pdf`;
}
