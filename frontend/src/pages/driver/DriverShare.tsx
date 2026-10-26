import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { QRCodeSVG } from 'qrcode.react';
import { get } from '../../lib/api';
import { ErrorBox, Spinner } from '../../components/ui';

export default function DriverShare() {
  const q = useQuery({ queryKey: ['driver-me'], queryFn: () => get<{ shareCode: string; shareLink: string; verificationStatus: string }>('/drivers/me') });
  const [copied, setCopied] = useState(false);
  if (q.isLoading) return <Spinner />;
  if (q.error || !q.data) return <ErrorBox error={q.error} />;
  const { shareLink, shareCode, verificationStatus } = q.data;

  return (
    <div className="card space-y-4 text-center">
      <h1 className="text-xl font-semibold">Invite your customers</h1>
      <p className="text-sm text-slate-600">Customers scan this code or open your link to add you as a trusted driver.</p>
      {verificationStatus !== 'APPROVED' && <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-800">Your link works for customers once you are verified.</p>}
      <div className="mx-auto w-fit rounded-xl border bg-white p-4"><QRCodeSVG value={shareLink} size={200} marginSize={1} /></div>
      <p className="font-mono text-lg tracking-widest">{shareCode}</p>
      <div className="flex gap-2">
        <input className="input" readOnly value={shareLink} aria-label="Share link" onFocus={(e) => e.currentTarget.select()} />
        <button className="btn-primary shrink-0" onClick={async () => { await navigator.clipboard?.writeText(shareLink); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? 'Copied ✓' : 'Copy'}</button>
      </div>
      {typeof navigator !== 'undefined' && 'share' in navigator && (
        <button className="btn-secondary w-full" onClick={() => navigator.share({ title: 'Book me on Trusted Driver Network', url: shareLink })}>Share…</button>
      )}
    </div>
  );
}
