import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { homePathFor, useAuth } from '../lib/auth';
import type { Role } from '../lib/types';
import { Spinner } from './ui';

/** Route guard. UX only: every API call is independently authorised on the server. */
export function RequireRole({ role }: { role?: Role }) {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <Spinner />;
  if (!user)
    return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  if (role && !user.roles.includes(role)) return <Navigate to={homePathFor(user.roles)} replace />;
  return <Outlet />;
}
