import {
  Award,
  Bell,
  Briefcase,
  Building2,
  CalendarCheck,
  CalendarDays,
  FileText,
  Gift,
  LayoutDashboard,
  Megaphone,
  ScrollText,
  Scale,
  Settings,
  ShieldCheck,
  UserRound,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import type { Role } from '@/types/api';

export interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  roles: Role[];
  end?: boolean;
}

export const ALL_ROLES: Role[] = [
  'SUPER_ADMIN',
  'HR_ADMIN',
  'HR_MANAGER',
  'MANAGER',
  'FINANCE',
  'RECRUITER',
  'EMPLOYEE',
];

const HR_ROLES: Role[] = ['SUPER_ADMIN', 'HR_ADMIN', 'HR_MANAGER'];

export const NAV_SECTIONS: { title: string; items: NavItem[] }[] = [
  {
    title: 'Overview',
    items: [
      { label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard, roles: ALL_ROLES, end: true },
      { label: 'My Profile', to: '/profile', icon: UserRound, roles: ALL_ROLES },
      // Employees manage their own records here; HR sees every employee's.
      { label: 'Documents', to: '/documents', icon: FileText, roles: ALL_ROLES },
    ],
  },
  {
    title: 'People',
    items: [
      { label: 'Employees', to: '/employees', icon: Users, roles: ['SUPER_ADMIN', 'HR_ADMIN', 'HR_MANAGER', 'MANAGER'] },
      { label: 'Departments', to: '/departments', icon: Building2, roles: HR_ROLES },
      { label: 'Designations', to: '/designations', icon: Briefcase, roles: HR_ROLES },
    ],
  },
  {
    title: 'Time & Leave',
    items: [
      { label: 'My Attendance', to: '/attendance/my', icon: CalendarCheck, roles: ALL_ROLES },
      { label: 'Attendance', to: '/attendance', icon: CalendarCheck, roles: HR_ROLES },
      { label: 'Team Attendance', to: '/attendance/team', icon: Users, roles: ['SUPER_ADMIN', 'HR_ADMIN', 'HR_MANAGER', 'MANAGER'] },
      { label: 'My Leaves', to: '/leaves/my', icon: CalendarDays, roles: ALL_ROLES },
      { label: 'Leave Requests', to: '/leaves/requests', icon: CalendarCheck, roles: ['SUPER_ADMIN', 'HR_ADMIN', 'HR_MANAGER', 'MANAGER'] },
      { label: 'Leave Types', to: '/leaves/types', icon: ScrollText, roles: HR_ROLES },
      { label: 'Leave Balances', to: '/leaves/balances', icon: Scale, roles: HR_ROLES },
      { label: 'Holidays', to: '/holidays', icon: Gift, roles: ALL_ROLES },
    ],
  },
  {
    title: 'Payroll',
    items: [
      { label: 'My Payslips', to: '/payroll/payslips', icon: FileText, roles: ALL_ROLES },
      { label: 'Salary Structures', to: '/payroll/salary', icon: Wallet, roles: ['SUPER_ADMIN', 'FINANCE', 'HR_ADMIN'] },
      { label: 'Payroll Runs', to: '/payroll', icon: Wallet, roles: ['SUPER_ADMIN', 'FINANCE'], end: true },
    ],
  },
  {
    title: 'Talent',
    items: [
      { label: 'Jobs', to: '/recruitment/jobs', icon: Briefcase, roles: ['SUPER_ADMIN', 'HR_ADMIN', 'HR_MANAGER', 'RECRUITER'] },
      { label: 'Candidates', to: '/recruitment/candidates', icon: Users, roles: ['SUPER_ADMIN', 'HR_ADMIN', 'HR_MANAGER', 'RECRUITER'] },
      { label: 'Interviews', to: '/recruitment/interviews', icon: CalendarCheck, roles: ['SUPER_ADMIN', 'HR_ADMIN', 'HR_MANAGER', 'RECRUITER'] },
      { label: 'Offers', to: '/recruitment/offers', icon: FileText, roles: ['SUPER_ADMIN', 'HR_ADMIN', 'RECRUITER'] },
      { label: 'Goals', to: '/performance/goals', icon: Award, roles: ALL_ROLES },
      { label: 'Reviews', to: '/performance/reviews', icon: Award, roles: ['SUPER_ADMIN', 'HR_ADMIN', 'HR_MANAGER', 'MANAGER'] },
    ],
  },
  {
    title: 'System',
    items: [
      { label: 'Announcements', to: '/announcements', icon: Megaphone, roles: ALL_ROLES },
      { label: 'Reports', to: '/reports', icon: FileText, roles: ['SUPER_ADMIN', 'HR_ADMIN', 'HR_MANAGER', 'FINANCE'] },
      { label: 'Users & Roles', to: '/users', icon: ShieldCheck, roles: HR_ROLES },
      { label: 'Audit Logs', to: '/audit-logs', icon: ScrollText, roles: ['SUPER_ADMIN'] },
      { label: 'Settings', to: '/settings', icon: Settings, roles: ['SUPER_ADMIN', 'HR_ADMIN'] },
    ],
  },
];

export function visibleSections(role: Role | undefined) {
  if (!role) return [];
  return NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => item.roles.includes(role)),
  })).filter((section) => section.items.length > 0);
}

export const BELL_ICON = Bell;
