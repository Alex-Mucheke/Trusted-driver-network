import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { get, post } from '../../lib/api';
import { ErrorBox } from '../ui';

interface Msg { id: string; senderId: string; content: string; createdAt: string }

export function Chat({ bookingId, meId }: { bookingId: string; meId: string }) {
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const q = useQuery({ queryKey: ['messages', bookingId], queryFn: () => get<Msg[]>(`/bookings/${bookingId}/messages`), refetchInterval: 20_000 });
  const send = useMutation({
    mutationFn: () => post(`/bookings/${bookingId}/messages`, { content: text }),
    onSuccess: () => { setText(''); qc.invalidateQueries({ queryKey: ['messages', bookingId] }); },
  });

  return (
    <section className="card space-y-3">
      <h2 className="font-semibold">Messages</h2>
      <div className="max-h-64 space-y-2 overflow-auto" aria-live="polite">
        {q.data?.length ? q.data.map((m) => (
          <div key={m.id} className={`flex ${m.senderId === meId ? 'justify-end' : ''}`}>
            <span className={`max-w-[80%] rounded-2xl px-3 py-1.5 text-sm ${m.senderId === meId ? 'bg-brand-700 text-white' : 'bg-slate-100'}`}>{m.content}</span>
          </div>
        )) : <p className="text-sm text-slate-500">No messages yet.</p>}
      </div>
      <ErrorBox error={send.error} />
      <form className="flex gap-2" onSubmit={(e: FormEvent) => { e.preventDefault(); if (text.trim()) send.mutate(); }}>
        <input className="input" value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} placeholder="Type a message" aria-label="Message" />
        <button className="btn-primary" disabled={!text.trim() || send.isPending}>Send</button>
      </form>
    </section>
  );
}
