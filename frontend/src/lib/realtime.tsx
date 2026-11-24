import { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { io, Socket } from 'socket.io-client';
import { useAuth } from './auth';

const SOCKET_URL: string = import.meta.env.VITE_SOCKET_URL ?? '';

const Ctx = createContext<Socket | null>(null);

/**
 * One authenticated socket per signed-in user (session cookie is sent with the handshake).
 * Server events simply invalidate the relevant queries, so screens refresh themselves.
 */
export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    if (!user) return;
    const s = io(`${SOCKET_URL}/realtime`, {
      withCredentials: true,
      transports: ['websocket', 'polling'],
    });
    const refresh = () => {
      qc.invalidateQueries({ queryKey: ['bookings'] });
      qc.invalidateQueries({ queryKey: ['booking'] });
      qc.invalidateQueries({ queryKey: ['referrals'] });
    };
    s.on('booking:update', refresh);
    s.on('notification', () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
      refresh();
    });
    s.on('message', () => qc.invalidateQueries({ queryKey: ['messages'] }));
    setSocket(s);
    return () => {
      s.disconnect();
      setSocket(null);
    };
  }, [user?.id, qc]); // eslint-disable-line react-hooks/exhaustive-deps

  return <Ctx.Provider value={socket}>{children}</Ctx.Provider>;
}

export const useSocket = () => useContext(Ctx);
