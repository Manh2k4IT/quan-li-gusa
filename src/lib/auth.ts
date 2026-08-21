import type { RequestCookies } from 'next/dist/compiled/@edge-runtime/cookies';
import { prisma } from '@/lib/prisma';

export const SESSION_COOKIE = 'gusa_session';

export type Role = 'CEO' | 'MANAGER' | 'SALE';

export type SessionUser = {
  email: string;
  name: string;
  role: Role;
  id?: string;
};

const VALID_USERS: Record<string, { password: string; name: string; role: Role }> = {
  'ceo@gusa.io': { password: 'ceo123', name: 'CEO GUSA', role: 'CEO' },
  'manager@gusa.io': { password: 'manager123', name: 'Manager GUSA', role: 'MANAGER' },
  'sale@gusa.io': { password: 'sale123', name: 'Sale GUSA', role: 'SALE' },
};

export const ROLE_LABELS: Record<Role, string> = {
  CEO: 'CEO',
  MANAGER: 'Quản lý',
  SALE: 'Sale',
};

export function getRoleLabel(role: Role) {
  return ROLE_LABELS[role];
}

export async function validateCredentials(email: string, password: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const seededUser = VALID_USERS[normalizedEmail];
  const dbUser = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });

  if (seededUser && seededUser.password === password) {
    return {
      id: dbUser?.id ?? normalizedEmail,
      email: normalizedEmail,
      name: seededUser.name,
      role: seededUser.role,
    } satisfies SessionUser;
  }

  if (!dbUser || dbUser.password !== password) {
    return null;
  }

  return {
    id: dbUser.id,
    email: normalizedEmail,
    name: dbUser.name,
    role: dbUser.role,
  } satisfies SessionUser;
}

export function getSession(cookies: RequestCookies | { get: (name: string) => { value?: string } | undefined }) {
  const cookie = cookies.get(SESSION_COOKIE);

  if (!cookie?.value) {
    return null;
  }

  try {
    return JSON.parse(cookie.value) as SessionUser;
  } catch {
    return null;
  }
}

export function canAccessModule(role: Role, module: string) {
  const accessMap: Record<string, Role[]> = {
    dashboard: ['CEO', 'MANAGER', 'SALE'],
    'admin-users': ['CEO', 'MANAGER'],
    'ai-brain': ['CEO', 'MANAGER'],
    'ai-chat': ['CEO', 'MANAGER'],
    'ai-workflow': ['CEO', 'MANAGER'],
    'sales-reports': ['CEO', 'MANAGER', 'SALE'],
    'sales-plan': ['CEO', 'MANAGER', 'SALE'],
  };

  return (accessMap[module] ?? ['CEO', 'MANAGER']).includes(role);
}

export function canManageModule(role: Role) {
  return role === 'CEO' || role === 'MANAGER';
}

export function getVisibleModules(role: Role) {
  if (role === 'SALE') {
    return [{
      key: 'sales-reports',
      name: 'Báo cáo Sale nhập',
      status: 'Nhập dữ liệu',
      icon: '▣',
      color: 'indigo',
      href: '/sales-reports',
    }, {
      key: 'sales-plan',
      name: 'Báo cáo kế hoạch',
      status: 'Mục tiêu',
      icon: '📋',
      color: 'indigo',
      href: '/sales-plan',
    }];
  }

  const modules = [
    { key: 'admin-users', name: 'Quản lý người dùng', status: 'Kiểm soát quyền', icon: '👤', color: 'indigo', href: '/admin/users' },
    { key: 'ai-brain', name: 'Trí tuệ AI', status: 'Trực tiếp', icon: '🧠', color: 'purple', href: '/ai-brain' },
    { key: 'ai-chat', name: 'Trò chuyện AI', status: 'Trợ lý', icon: '💬', color: 'purple', href: '/ai-chat' },
    { key: 'ai-workflow', name: 'Luồng AI', status: 'Tự động hóa', icon: '⚙️', color: 'purple', href: '/ai-workflow' },
  ];

  return modules.filter((module) => canAccessModule(role, module.key));
}
