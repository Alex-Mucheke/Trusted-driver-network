import { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { get, post } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { NotificationItem } from '../lib/types';
import { when } from './ui';

function navFor(roles: string[]) {
  if (roles.includes('ADMIN')) return [{ to: '/admin', label: 'Console' }];
  if (roles.includes('DRIVER')) {
    return [
      { to: '/driver', label: 'Dashboard' },
      { to: '/driver/jobs', label: 'Jobs' },
      { to: '/driver/network', label: 'Network' },
      { to: '/driver/share', label: 'Share' },
      { to: '/driver/profile', label: 'Profile' },
    ];
  }
  return [
    { to: '/app', label: 'My drivers' },
    { to: '/app/bookings', label: 'Bookings' },
  ];
}

function Bell() {
  const [open, setOpen] = useState(false);
  const nav = useNavigate();
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => get<NotificationItem[]>('/notifications'),
    refetchInterval: 60_000,
  });
  const readAll = useMutation({
    mutationFn: () => post('/notifications/read-all'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
  const unread = data?.filter((n) => !n.readAt).length ?? 0;

  return (
    <div className="relative">
      <button
        className="relative rounded-lg p-2 hover:bg-slate-100"
        onClick={() => setOpen((o) => !o)}
        aria-label={`Notifications (${unread} unread)`}
      >
        <span aria-hidden>🔔</span>
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 rounded-full bg-red-600 px-1.5 text-[10px] font-bold text-white">
            {unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-80 max-w-[90vw] rounded-xl border border-slate-200 bg-white shadow-lg">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <span className="text-sm font-semibold">Notifications</span>
            {unread > 0 && (
              <button
                className="text-xs text-brand-700 hover:underline"
                onClick={() => readAll.mutate()}
              >
                Mark all read
              </button>
            )}
          </div>
          <ul className="max-h-80 divide-y overflow-auto">
            {data?.length ? (
              data.map((n) => (
                <li key={n.id}>
                  <button
                    className={`block w-full px-3 py-2 text-left text-sm hover:bg-slate-50 ${n.readAt ? 'text-slate-500' : 'font-medium'}`}
                    onClick={() => {
                      setOpen(false);
                      if (n.data?.bookingId) nav(`/bookings/${n.data.bookingId}`);
                    }}
                  >
                    <div>{n.title}</div>
                    <div className="text-xs font-normal text-slate-500">{n.body}</div>
                    <div className="mt-0.5 text-[11px] font-normal text-slate-400">
                      {when(n.createdAt)}
                    </div>
                  </button>
                </li>
              ))
            ) : (
              <li className="px-3 py-6 text-center text-sm text-slate-500">Nothing yet</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

export function Shell() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const links = user ? navFor(user.roles) : [];

  return (
    <div className="mx-auto min-h-screen max-w-3xl px-4 pb-16">
      <header className="sticky top-0 z-30 -mx-4 mb-4 border-b border-slate-200 bg-white/90 px-4 py-2 backdrop-blur">
        <div className="flex items-center justify-between gap-2">
          <Link to="/" className="flex items-center gap-2 font-semibold text-brand-800">
            <img src="/icon.svg" alt="" className="h-7 w-7" />
            <span className="hidden sm:inline">Trusted Driver Network</span>
          </Link>
          {user ? (
            <div className="flex items-center gap-1">
              <Bell />
              <NavLink to="/settings" className="rounded-lg px-2 py-1 text-sm hover:bg-slate-100">
                {user.name.split(' ')[0]}
              </NavLink>
              <button
                className="btn-secondary !px-3 !py-1"
                onClick={async () => {
                  await logout();
                  nav('/');
                }}
              >
                Sign out
              </button>
            </div>
          ) : (
            <Link className="btn-primary" to="/login">
              Sign in
            </Link>
          )}
        </div>
        {links.length > 0 && (
          <nav className="-mx-1 mt-2 flex gap-1 overflow-x-auto" aria-label="Main">
            {links.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end
                className={({ isActive }) =>
                  `whitespace-nowrap rounded-lg px-3 py-1.5 text-sm ${isActive ? 'bg-brand-100 font-medium text-brand-800' : 'text-slate-600 hover:bg-slate-100'}`
                }
              >
                {l.label}
              </NavLink>
            ))}
          </nav>
        )}
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  );
}
