import { createContext, ReactNode, useContext } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, get, post } from './api';
import type { Role, User } from './types';

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (data: {
    name: string;
    email: string;
    phone: string;
    password: string;
    role: 'CUSTOMER' | 'DRIVER';
    acceptPrivacyNotice: boolean;
    consentDriverVerification?: boolean;
  }) => Promise<User>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        return (await get<{ user: User }>('/auth/me')).user;
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null;
        throw e;
      }
    },
    staleTime: 60_000,
    retry: false,
  });

  const value: AuthState = {
    user: data ?? null,
    loading: isLoading,
    login: async (email, password) => {
      const { user } = await post<{ user: User }>('/auth/login', { email, password });
      qc.setQueryData(['me'], user);
      return user;
    },
    register: async (d) => {
      const { user } = await post<{ user: User }>('/auth/register', d);
      qc.setQueryData(['me'], user);
      return user;
    },
    logout: async () => {
      await post('/auth/logout');
      qc.clear();
      qc.setQueryData(['me'], null);
    },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth outside AuthProvider');
  return v;
}

export function homePathFor(roles: Role[]): string {
  if (roles.includes('ADMIN')) return '/admin';
  if (roles.includes('DRIVER')) return '/driver';
  return '/app';
}
