import type { jsPDF } from 'jspdf';
import { companyLogoUrl } from '@/lib/api';
import {
  amountInWords,
  formatPayslipDate,
  formatPayslipMoney,
} from '@/lib/payslip-format';
import type { PayslipPrint } from '@/types/payroll';

const PAGE_WIDTH = 210;
const MARGIN = 12;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

const COMPANY = {
  name: 'SuperLink IT Services Private Limited',
  address: [
    '1st floor, Thimmaiah complex, Immadihalli main road,',
    'Next to Bescom office, Whitefield, Bangalore - 560066',
  ],
};

interface LogoAsset {
  dataUrl: string;
  format: 'PNG' | 'JPEG';
}

let cachedLogo: LogoAsset | null | undefined;

/** Keeps the logo crisp at 24 mm while avoiding a multi-megabyte PDF. */
function shrinkLogo(dataUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      try {
        const maxSize = 320;
        const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const context = canvas.getContext('2d');
        if (!context) {
          resolve(dataUrl);
          return;
        }
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/png'));
      } catch {
        resolve(dataUrl);
      }
    };
    image.onerror = () => resolve(dataUrl);
    image.src = dataUrl;
  });
}

async function loadLogo(): Promise<LogoAsset | null> {
  if (cachedLogo !== undefined) return cachedLogo;
  try {
    const response = await fetch(companyLogoUrl);
    if (!response.ok) throw new Error('Logo could not be loaded');
    const blob = await response.blob();
    const raw = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') resolve(reader.result);
        else reject(new Error('Logo could not be read'));
      };
      reader.onerror = () => reject(reader.error ?? new Error('Logo could not be read'));
      reader.readAsDataURL(blob);
    });
    cachedLogo = { dataUrl: await shrinkLogo(raw), format: 'PNG' };
  } catch {
    cachedLogo = null;
  }
  return cachedLogo;
}

function field(
  doc: jsPDF,
  label: string,
  value: string | number,
  columnX: number,
  baseline: number,
  labelWidth: number,
) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text(label, columnX, baseline);
  doc.text(':', columnX + labelWidth, baseline);
  doc.setFont('helvetica', 'normal');
  doc.text(String(value ?? ''), columnX + labelWidth + 3, baseline);
}

function drawPayslip(doc: jsPDF, payslip: PayslipPrint, logo: LogoAsset | null) {
  const x = MARGIN;
  const w = CONTENT_WIDTH;
  const employee = payslip.employee;
  const employeeName = [employee.firstName, employee.middleName, employee.lastName]
    .filter(Boolean)
    .join(' ');

  doc.setTextColor(0, 0, 0);
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.2);

  if (logo) {
    try {
      doc.addImage(logo.dataUrl, logo.format, x + w - 24, 12, 24, 24);
    } catch {
      // A missing logo should never block a payslip download.
    }
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(COMPANY.name, x + w / 2, 22, { align: 'center' });
  doc.setFontSize(8.5);
  doc.text(COMPANY.address[0], x + w / 2, 28, { align: 'center' });
  doc.text(COMPANY.address[1], x + w / 2, 32.5, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text(
    `PAYSLIP FOR THE MONTH OF ${payslip.period.monthLabel}    (From ${formatPayslipDate(
      payslip.period.fromDate,
    )} To ${formatPayslipDate(payslip.period.toDate)})`,
    x,
    41,
  );

  // Days box
  const daysTop = 45;
  const daysHeight = 38;
  doc.rect(x, daysTop, w, daysHeight);

  const leftDays: Array<[string, string | number]> = [
    ['Total Days', payslip.days.totalDays],
    ['Paid Holidays', payslip.days.paidHolidays],
    ['LWP', payslip.days.lwp],
    ['Paid Leaves', payslip.days.paidLeaves],
    ['Net Paid Days', payslip.days.netPaidDays],
  ];
  const rightDays: Array<[string, string | number]> = [
    ['Weekly Off (Sat & Sun)', payslip.days.weeklyOff],
    ['Working Days', payslip.days.workingDays],
    ['Present Days', payslip.days.presentDays],
    ['Maximum Payable Days', payslip.days.maximumPayableDays],
    ['New Joiner Arrear Days', payslip.days.newJoinerArrearDays],
  ];

  leftDays.forEach(([label, value], index) =>
    field(doc, label, value, x + 2, daysTop + 5.5 + index * 7.2, 44),
  );
  rightDays.forEach(([label, value], index) =>
    field(doc, label, value, x + w / 2 + 2, daysTop + 5.5 + index * 7.2, 44),
  );

  // Employee box
  const employeeTop = daysTop + daysHeight;
  const employeeHeight = 45;
  doc.rect(x, employeeTop, w, employeeHeight);

  const employeeRows: Array<[string, string, string, string]> = [
    ['Employee Name', employeeName, 'Code', employee.employeeCode],
    ['DOJ', formatPayslipDate(employee.joiningDate), 'PAN', employee.panNumber ?? ''],
    ['Bank A/c No.', employee.bankAccountNumber ?? '', 'ESI A/c No.', employee.esiNumber ?? ''],
    ['Department', employee.department?.name ?? '', 'Designation', employee.designation?.name ?? ''],
    ['Pay Mode', employee.payMode ?? '', 'Bank Name', employee.bankName ?? ''],
    ['PF Number', employee.pfNumber ?? '', 'UAN', employee.uan ?? ''],
    ['LOP', String(payslip.days.lop), '', ''],
  ];

  employeeRows.forEach(([leftLabel, leftValue, rightLabel, rightValue], index) => {
    const baseline = employeeTop + 5 + index * 6.1;
    field(doc, leftLabel, leftValue, x + 2, baseline, 38);
    if (rightLabel) field(doc, rightLabel, rightValue, x + w / 2 + 2, baseline, 32);
  });

  // Earnings and deductions
  const tableTop = employeeTop + employeeHeight + 4;
  const tableHeight = 72;
  const headerHeight = 7;
  const totalHeight = 7;
  const columnX = [x, x + 60, x + 79, x + 109, x + 159, x + w];

  doc.rect(x, tableTop, w, tableHeight);
  doc.line(x, tableTop + headerHeight, x + w, tableTop + headerHeight);
  doc.line(x, tableTop + tableHeight - totalHeight, x + w, tableTop + tableHeight - totalHeight);
  for (const boundary of columnX.slice(1, -1)) {
    doc.line(boundary, tableTop, boundary, tableTop + tableHeight);
  }

  const headerBaseline = tableTop + 4.8;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('Earnings', x + 2, headerBaseline);
  doc.text('Arrear', columnX[2] - 2, headerBaseline, { align: 'right' });
  doc.text('Amount', columnX[3] - 2, headerBaseline, { align: 'right' });
  doc.text('Deductions', columnX[3] + 2, headerBaseline);
  doc.text('Amount', columnX[5] - 2, headerBaseline, { align: 'right' });

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

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  const rowCount = Math.max(earnings.length, deductions.length);
  for (let index = 0; index < rowCount; index += 1) {
    const baseline = tableTop + headerHeight + 5 + index * 6;
    const earning = earnings[index];
    const deduction = deductions[index];
    if (earning) {
      doc.text(earning[0], x + 2, baseline);
      doc.text(formatPayslipMoney(0), columnX[2] - 2, baseline, { align: 'right' });
      doc.text(formatPayslipMoney(earning[1]), columnX[3] - 2, baseline, { align: 'right' });
    }
    if (deduction) {
      doc.text(deduction[0], columnX[3] + 2, baseline);
      doc.text(formatPayslipMoney(deduction[1]), columnX[5] - 2, baseline, { align: 'right' });
    }
  }

  const totalBaseline = tableTop + tableHeight - totalHeight + 4.8;
  doc.setFont('helvetica', 'bold');
  doc.text('Total Earnings', x + 2, totalBaseline);
  doc.text(formatPayslipMoney(payslip.grossSalary), columnX[3] - 2, totalBaseline, {
    align: 'right',
  });
  doc.text('Total Deductions', columnX[3] + 2, totalBaseline);
  doc.text(formatPayslipMoney(payslip.totalDeductions), columnX[5] - 2, totalBaseline, {
    align: 'right',
  });

  // Reimbursements and net transfer
  const reimbursementTop = tableTop + tableHeight + 4;
  const reimbursementHeight = 42;
  const reimbursementHeader = 7;
  const reimbursementRow = 6;
  const totalTop = reimbursementTop + reimbursementHeader + reimbursementRow * 2;
  const netTop = totalTop + 7;
  const wordsTop = netTop + 7;
  const dividerX = x + w * 0.58;

  doc.rect(x, reimbursementTop, w, reimbursementHeight);
  doc.line(x, reimbursementTop + reimbursementHeader, x + w, reimbursementTop + reimbursementHeader);
  doc.line(dividerX, reimbursementTop + reimbursementHeader, dividerX, totalTop);
  doc.line(x, totalTop, x + w, totalTop);
  doc.line(x, netTop, x + w, netTop);
  doc.line(x, wordsTop, x + w, wordsTop);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('REIMBURSEMENTS', x + 2, reimbursementTop + 4.8);
  doc.text('AMOUNT', x + w - 2, reimbursementTop + 4.8, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.text('TELEPHONE REIMBURSEMENT', x + 2, reimbursementTop + 11.3);
  doc.text('LTA REIMBURSEMENT', x + 2, reimbursementTop + 17.3);
  doc.text(formatPayslipMoney(payslip.reimbursements.telephone), x + w - 2, reimbursementTop + 11.3, {
    align: 'right',
  });
  doc.text(formatPayslipMoney(payslip.reimbursements.lta), x + w - 2, reimbursementTop + 17.3, {
    align: 'right',
  });

  doc.setFont('helvetica', 'bold');
  doc.text('TOTAL REIMBURSEMENT', x + 2, totalTop + 4.8);
  doc.text(formatPayslipMoney(payslip.reimbursements.total), x + w - 2, totalTop + 4.8, {
    align: 'right',
  });

  doc.text('NET TRANSFER', x + 2, netTop + 4.8);
  doc.text(':', x + 40, netTop + 4.8);
  doc.text(formatPayslipMoney(payslip.netSalary), x + w - 2, netTop + 4.8, { align: 'right' });

  doc.text('IN WORDS', x + 2, wordsTop + 5);
  doc.text(':', x + 40, wordsTop + 5);
  doc.setFont('helvetica', 'normal');
  const words = doc.splitTextToSize(amountInWords(payslip.netSalary), w - 45) as string[];
  doc.text(words, x + 43, wordsTop + 5);

  // Footer
  const footerTop = reimbursementTop + reimbursementHeight;
  const footerHeight = 12;
  doc.rect(x, footerTop, w, footerHeight);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('Computer generated payslip,', x + w - 2, footerTop + 4.5, { align: 'right' });
  doc.text('Employer signature not required', x + w - 2, footerTop + 9, { align: 'right' });
}

export async function downloadPayslips(items: PayslipPrint[], fileName: string): Promise<void> {
  if (items.length === 0) throw new Error('There are no payslips to download');

  // jsPDF is large, so it is loaded only when someone actually downloads.
  const { jsPDF: JsPDF } = await import('jspdf');
  const doc = new JsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const logo = await loadLogo();

  items.forEach((payslip, index) => {
    if (index > 0) doc.addPage();
    drawPayslip(doc, payslip, logo);
  });

  doc.save(fileName);
}
