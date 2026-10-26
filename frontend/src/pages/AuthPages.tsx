import { FormEvent, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { homePathFor, useAuth } from '../lib/auth';
import { ErrorBox, Field } from '../components/ui';

function Frame({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <Link to="/" className="mb-6 flex items-center gap-2 font-semibold text-brand-800">
        <img src="/icon.svg" alt="" className="h-8 w-8" /> Trusted Driver Network
      </Link>
      <div className="card space-y-4">
        <h1 className="text-xl font-semibold">{title}</h1>
        {children}
      </div>
    </div>
  );
}

export function Login() {
  const { user, login } = useAuth();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const next = params.get('next');

  if (user) return <Navigate to={next ?? homePathFor(user.roles)} replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const u = await login(email, password);
      nav(next && next.startsWith('/') ? next : homePathFor(u.roles), { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Frame title="Sign in">
      <form onSubmit={submit} className="space-y-3">
        <Field label="Email"><input className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label="Password"><input className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
        <ErrorBox error={error} />
        <button className="btn-primary w-full" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
      <p className="text-center text-sm text-slate-600">
        New here? <Link className="text-brand-700 hover:underline" to={next ? `/register?next=${encodeURIComponent(next)}` : '/register'}>Create an account</Link>
      </p>
    </Frame>
  );
}

export function Register() {
  const { user, register } = useAuth();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const [role, setRole] = useState<'CUSTOMER' | 'DRIVER'>(params.get('role') === 'DRIVER' ? 'DRIVER' : 'CUSTOMER');
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '' });
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const next = params.get('next');

  if (user) return <Navigate to={next ?? homePathFor(user.roles)} replace />;
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const u = await register({ ...form, role });
      nav(next && next.startsWith('/') ? next : homePathFor(u.roles), { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Frame title="Create your account">
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Account type">
        {(['CUSTOMER', 'DRIVER'] as const).map((r) => (
          <button
            key={r} type="button" role="radio" aria-checked={role === r}
            onClick={() => setRole(r)}
            className={`rounded-lg border px-3 py-2 text-sm ${role === r ? 'border-brand-700 bg-brand-50 font-medium text-brand-800' : 'border-slate-300'}`}
          >
            {r === 'CUSTOMER' ? 'I need rides' : "I'm a driver"}
          </button>
        ))}
      </div>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Full name"><input className="input" required minLength={2} autoComplete="name" value={form.name} onChange={set('name')} /></Field>
        <Field label="Email"><input className="input" type="email" required autoComplete="email" value={form.email} onChange={set('email')} /></Field>
        <Field label="Phone" hint="e.g. +254712345678">
          <input className="input" type="tel" required pattern="\+?[0-9]{9,15}" autoComplete="tel" value={form.phone} onChange={set('phone')} />
        </Field>
        <Field label="Password" hint="At least 8 characters">
          <input className="input" type="password" required minLength={8} autoComplete="new-password" value={form.password} onChange={set('password')} />
        </Field>
        {role === 'DRIVER' && (
          <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
            Drivers must submit identity, licence and vehicle documents and be verified by our team before going online.
          </p>
        )}
        <ErrorBox error={error} />
        <button className="btn-primary w-full" disabled={busy}>{busy ? 'Creating…' : 'Create account'}</button>
      </form>
      <p className="text-center text-sm text-slate-600">
        Already registered? <Link className="text-brand-700 hover:underline" to="/login">Sign in</Link>
      </p>
    </Frame>
  );
}
