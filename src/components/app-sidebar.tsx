'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Icon, type IconName } from '@/components/icons';
import { useNotifications } from '@/components/notification-bell';
import UserAvatar from '@/components/user-avatar';

export type SidebarUser = {
  name: string;
  role: 'CEO' | 'MANAGER' | 'SALE';
  roleLabel: string;
  avatar?: string | null;
};

type NavChild = { href: string; label: string };
// `match` lists extra path prefixes that should also light this item up.
type NavItem = { href: string; label: string; icon: IconName; children?: NavChild[]; match?: string[] };
type NavSection = { title: string; items: NavItem[] };

const groupChildren = (base: string): NavChild[] => [
  { href: `${base}?group=fashion-q4`, label: 'Thời trang Quận 4' },
  { href: `${base}?group=fabric-q4`, label: 'Vải Quận 4' },
  { href: `${base}?group=fabric-ben-thanh`, label: 'Vải Bến Thành' },
];

const SALES_SECTION: NavSection = {
  title: 'Sale',
  items: [
    { href: '/sales-reports', label: 'Báo cáo Sale nhập', icon: 'fileText' },
    { href: '/sales-plan', label: 'Báo cáo kế hoạch', icon: 'target' },
    { href: '/customer-analysis', label: 'Phân tích khách hàng', icon: 'userCheck', children: groupChildren('/customer-analysis') },
    { href: '/product-analysis', label: 'Phân tích sản phẩm', icon: 'package', children: groupChildren('/product-analysis') },
  ],
};

const SALE_CUSTOMER_SECTION: NavSection = {
  title: 'Khách hàng',
  items: [{ href: '/my-customers', label: 'Khách hàng của tôi', icon: 'userCheck' }],
};

const MANAGEMENT_SECTIONS: NavSection[] = [
  {
    title: 'Tổng quan',
    items: [
      { href: '/', label: 'Dashboard điều hành', icon: 'dashboard' },
      { href: '/admin/users', label: 'Quản lý người dùng', icon: 'users' },
      { href: '/admin/zalo', label: 'Thông báo Zalo', icon: 'bell' },
    ],
  },
  {
    title: 'Vận hành',
    items: [
      { href: '/plan', label: 'Bảng giao kế hoạch', icon: 'clipboard' },
    ],
  },
  {
    title: 'Khách hàng',
    items: [
      { href: '/customers', label: 'Danh sách khách hàng', icon: 'users' },
      { href: '/my-customers', label: 'Báo cáo giao khách', icon: 'chart' },
    ],
  },
  {
    title: 'Báo cáo',
    items: [
      { href: '/reports', label: 'Báo cáo', icon: 'fileText', match: ['/sales-reports', '/sales-plan', '/customer-analysis', '/product-analysis', '/daily-reports', '/attendance'] },
    ],
  },
  {
    title: 'Trợ lý AI',
    items: [
      { href: '/ai-brain', label: 'Trí tuệ AI', icon: 'sparkles' },
      { href: '/ai-chat', label: 'Trò chuyện AI', icon: 'message' },
      { href: '/ai-workflow', label: 'Luồng tự động', icon: 'workflow' },
    ],
  },
];

function isPathActive(pathname: string, href: string) {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
}

export default function AppSidebar({ user }: { user: SidebarUser | null }) {
  const pathname = usePathname();
  const notifications = useNotifications();
  const searchParams = useSearchParams();
  const [menuOpen, setMenuOpen] = useState(false);
  const sections = user?.role === 'SALE' ? [SALE_CUSTOMER_SECTION, SALES_SECTION] : MANAGEMENT_SECTIONS;

  const isChildActive = (child: NavChild) => {
    const [path, query] = child.href.split('?');
    if (!isPathActive(pathname, path)) return false;
    if (!query) return true;
    const [key, value] = query.split('=');
    return (searchParams.get(key) || 'fabric-q4') === value;
  };

  return (
    <aside className={`sidebar${menuOpen ? ' open' : ''}`}>
      <div className="sidebar-head">
        {/* Only visible on narrow screens, where the nav collapses into a drawer. */}
        <button type="button" className="sidebar-toggle" onClick={() => setMenuOpen((open) => !open)} aria-expanded={menuOpen} aria-label={menuOpen ? 'Đóng menu' : 'Mở menu'}>
          <Icon name={menuOpen ? 'close' : 'menu'} size={20} />
        </button>
        <Link href="/" className="brand-box" onClick={() => setMenuOpen(false)}>
          <div className="brand-mark">G</div>
          <div>
            <p className="eyebrow">Hệ thống quản trị</p>
            <h1>GUSA</h1>
          </div>
        </Link>
      </div>

      {/* On narrow screens the panel is a drawer; the backdrop beside it closes it. */}
      <div className="sidebar-backdrop" onClick={() => setMenuOpen(false)} aria-hidden="true" />
      <div className="sidebar-panel">
        <nav className="nav" onClick={(event) => { if ((event.target as HTMLElement).closest('a')) setMenuOpen(false); }}>
          {sections.map((section) => (
            <div key={section.title} className="nav-section">
              <span className="nav-title">{section.title}</span>
              {section.items.map((item) => {
                const active = [item.href, ...(item.match ?? [])].some((href) => isPathActive(pathname, href));
                const unread = notifications?.unreadFor([item.href, ...(item.match ?? [])]) ?? 0;
                const link = (
                  <>
                    <span className="nav-icon"><Icon name={item.icon} /></span>
                    <span className="nav-label">{item.label}</span>
                    {unread ? <span className="nav-badge" aria-label={`${unread} thông báo mới`}>{unread > 9 ? '9+' : unread}</span> : null}
                  </>
                );

                if (!item.children) {
                  return (
                    <Link key={item.href} href={item.href} className={`nav-item${active ? ' active' : ''}`}>
                      {link}
                    </Link>
                  );
                }

                return (
                  <details key={item.href} className="nav-group" open={active || undefined}>
                    <summary className={`nav-item nav-summary${active ? ' active' : ''}`}>{link}</summary>
                    <div className="nav-submenu">
                      {item.children.map((child) => (
                        <Link key={child.href} href={child.href} className={`nav-submenu-item${isChildActive(child) ? ' active' : ''}`}>
                          {child.label}
                        </Link>
                      ))}
                    </div>
                  </details>
                );
              })}
            </div>
          ))}
        </nav>

        {user ? (
          <div className="sidebar-user">
            <UserAvatar name={user.name} avatar={user.avatar ?? null} className="sidebar-user-avatar" />
            <div className="sidebar-user-info">
              <strong>{user.name}</strong>
              <small>{user.roleLabel}</small>
            </div>
            <form action="/api/logout" method="POST">
              <button type="submit" className="sidebar-logout" title="Đăng xuất" aria-label="Đăng xuất">
                <Icon name="logOut" size={16} />
              </button>
            </form>
          </div>
        ) : null}
      </div>
    </aside>
  );
}
