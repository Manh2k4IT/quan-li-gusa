'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Icon, type IconName } from '@/components/icons';

type AppNotification = {
  id: string;
  kind: 'plan' | 'report' | 'customer' | 'approved' | 'rejected';
  title: string;
  body: string;
  href: string;
  at: string;
};

// Read markers live in localStorage: a global "read everything up to" time plus one per page,
// so opening a page clears the notifications that point at it.
type SeenState = { all: string; byPath: Record<string, string> };

type NotificationContextValue = {
  items: AppNotification[];
  isUnread: (item: AppNotification) => boolean;
  unreadFor: (prefixes: string[]) => number;
  markAllRead: () => void;
};

const POLL_MS = 60_000;
const KIND_ICONS: Record<AppNotification['kind'], IconName> = {
  plan: 'clipboard',
  report: 'fileText',
  customer: 'userCheck',
  approved: 'target',
  rejected: 'message',
};

const NotificationContext = createContext<NotificationContextValue | null>(null);

export const useNotifications = () => useContext(NotificationContext);

const pathOf = (href: string) => href.split('?')[0];

function matchesPrefix(path: string, prefix: string) {
  return prefix === '/' ? path === '/' : path === prefix || path.startsWith(`${prefix}/`);
}

function readSeen(key: string): SeenState {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) ?? '{}');
    return { all: typeof parsed.all === 'string' ? parsed.all : '', byPath: parsed.byPath && typeof parsed.byPath === 'object' ? parsed.byPath : {} };
  } catch {
    return { all: '', byPath: {} };
  }
}

function writeSeen(key: string, seen: SeenState) {
  try {
    window.localStorage.setItem(key, JSON.stringify(seen));
  } catch {
    // Private mode: read state just won't persist.
  }
}

export function NotificationProvider({ storageKey, children }: { storageKey: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [, setVersion] = useState(0);
  const seenKey = `gusa_notifications_seen:${storageKey}`;

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      if (document.hidden) return;
      fetch('/api/notifications', { cache: 'no-store' })
        .then((response) => (response.ok ? response.json() : { notifications: [] }))
        .then((payload) => {
          if (!cancelled) setItems(payload.notifications ?? []);
        })
        .catch(() => undefined);
    };
    load();
    const timer = window.setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [seenKey]);

  // Visiting a page marks its notifications as read.
  useEffect(() => {
    const latest = items.filter((item) => pathOf(item.href) === pathname).reduce((max, item) => (item.at > max ? item.at : max), '');
    if (!latest) return;
    const seen = readSeen(seenKey);
    if ((seen.byPath[pathname] ?? '') >= latest) return;
    writeSeen(seenKey, { ...seen, byPath: { ...seen.byPath, [pathname]: latest } });
  }, [items, pathname, seenKey]);

  // Items only exist after the client fetch, so reading storage here never affects hydration.
  const seen = items.length ? readSeen(seenKey) : { all: '', byPath: {} };
  const isUnread = (item: AppNotification) => {
    const path = pathOf(item.href);
    if (path === pathname) return false;
    const marker = [seen.all, seen.byPath[path] ?? ''].reduce((max, value) => (value > max ? value : max), '');
    return item.at > marker;
  };
  const unreadFor = (prefixes: string[]) => items.filter((item) => isUnread(item) && prefixes.some((prefix) => matchesPrefix(pathOf(item.href), prefix))).length;
  const markAllRead = () => {
    writeSeen(seenKey, { ...readSeen(seenKey), all: items[0]?.at ?? new Date().toISOString() });
    setVersion((version) => version + 1);
  };

  return <NotificationContext.Provider value={{ items, isUnread, unreadFor, markAllRead }}>{children}</NotificationContext.Provider>;
}

function timeAgo(iso: string) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (minutes < 1) return 'vừa xong';
  if (minutes < 60) return `${minutes} phút trước`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} giờ trước`;
  const days = Math.round(hours / 24);
  return days < 30 ? `${days} ngày trước` : new Date(iso).toLocaleDateString('vi-VN');
}

export default function NotificationBell() {
  const notifications = useNotifications();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === 'Escape' : !rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  if (!notifications) return null;
  const { items, isUnread, markAllRead } = notifications;
  const unread = items.filter(isUnread).length;

  return (
    <div className="app-bell" ref={rootRef}>
      <button
        type="button"
        className={`app-bell-button${open ? ' active' : ''}`}
        onClick={() => setOpen((value) => !value)}
        aria-label={unread ? `${unread} thông báo chưa đọc` : 'Thông báo'}
        aria-expanded={open}
      >
        <Icon name="bell" size={19} />
        {unread ? <span className="app-bell-badge">{unread > 9 ? '9+' : unread}</span> : null}
      </button>

      {open ? (
        <div className="app-bell-panel" role="dialog" aria-label="Thông báo">
          <div className="app-bell-head">
            <strong>Thông báo</strong>
            {unread ? <button type="button" className="cx-link" onClick={markAllRead}>Đánh dấu đã đọc</button> : null}
          </div>
          {items.length === 0 ? (
            <p className="app-bell-empty">Chưa có thông báo nào trong 30 ngày qua.</p>
          ) : (
            <ul className="app-bell-list">
              {items.map((item) => (
                <li key={item.id}>
                  <Link href={item.href} className={`app-bell-item app-bell-${item.kind}${isUnread(item) ? ' unread' : ''}`} onClick={() => setOpen(false)}>
                    <span className="app-bell-icon"><Icon name={KIND_ICONS[item.kind]} size={16} /></span>
                    <span className="app-bell-text">
                      <strong>{item.title}</strong>
                      <small>{item.body}</small>
                      <em>{timeAgo(item.at)}</em>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
