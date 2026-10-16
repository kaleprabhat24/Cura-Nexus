import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ShieldCheck, Network, Users, FileJson } from 'lucide-react';
import { useDb, patients } from '@/store';
import { login, signup, useSession } from '@/app/auth';
import { Logo, ThemeToggle } from '@/app/App';
import type { Role } from '@/store';

export const MODULE1 = 'Module 1 — CXR triage';
export const MODULE2 = 'Module 2 — Chronic care';

function PublicHeader() {
  const user = useSession();
  return (
    <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
      <Logo />
      <nav className="flex items-center gap-2 text-sm">
        <Link to="/problem-statement" className="btn-ghost">Problem statement</Link>
        {user ? <Link to="/app" className="btn-primary">Open app</Link> : <><Link to="/login" className="btn-ghost">Sign in</Link><Link to="/signup" className="btn-primary">Sign up</Link></>}
        <ThemeToggle />
      </nav>
    </header>
  );
}

export function Landing() {
  const db = useDb();
  const pts = patients(db);
  const sources = new Set(db.resources.map((r) => r.meta?.source ?? 'Cura Nexus'));
  const consented = pts.filter((p) => db.resources.some((r) => r.resourceType === 'Consent' && r.status === 'active' && r.patient?.reference === `Patient/${p.id}`)).length;
  const stats = [
    { label: 'FHIR resources in the record', value: db.resources.length },
    { label: 'Source systems feeding it', value: sources.size },
    { label: 'Patients with active consent', value: `${pts.length ? Math.round((consented / pts.length) * 100) : 0}%` },
    { label: 'Audit events recorded', value: db.audit.length },
  ];
  return (
    <div className="min-h-screen">
      <PublicHeader />
      <section className="mx-auto max-w-6xl px-4 py-12">
        <p className="badge mb-4">Unified Patient Record & Interoperability Platform</p>
        <h1 className="max-w-3xl font-display text-4xl font-bold tracking-tight md:text-5xl">One patient, one record, any source, works offline.</h1>
        <p className="mt-4 max-w-2xl text-lg text-fg-muted">Cura Nexus joins imaging, chronic-care, lab and billing data into one FHIR R4 patient record, with consent and an audit trail — running entirely in the browser.</p>
        <div className="mt-6 flex gap-2"><Link to="/login" className="btn-primary">Try the demo</Link><Link to="/problem-statement" className="btn-ghost">Read the problem statement</Link></div>
      </section>
      <section className="mx-auto max-w-6xl px-4 pb-12">
        <h2 className="h2 mb-3">Why hospitals buy this <span className="muted font-normal">(numbers computed live from this browser's data)</span></h2>
        <div className="grid gap-3 md:grid-cols-4">
          {stats.map((s) => <div key={s.label} className="card"><div className="text-2xl font-semibold tabular-nums">{s.value}</div><div className="muted">{s.label}</div></div>)}
        </div>
        <div className="mt-6 grid gap-3 md:grid-cols-4">
          {[
            [FileJson, 'FHIR R4 record', 'Patient, Observation, Condition, MedicationRequest and Consent resources, exportable as a Bundle.'],
            [Network, 'Connects your AI modules', 'Imports CXR-triage and chronic-care results into the same record with source badges.'],
            [Users, 'Duplicate check', 'Fuzzy name + date of birth + phone matching before a new patient is created.'],
            [ShieldCheck, 'Consent & audit', 'Patients grant and revoke consent; every action lands in the audit log.'],
          ].map(([Icon, t, d]) => {
            const I = Icon as typeof FileJson;
            return <div key={t as string} className="card"><I size={18} className="text-accent" /><div className="mt-2 font-medium">{t as string}</div><p className="muted">{d as string}</p></div>;
          })}
        </div>
      </section>
      <footer className="border-t border-line py-6 text-center text-xs text-fg-subtle">Synthetic demo data · decision support only, not a medical device · <Link to="/problem-statement" className="underline">Problem statement</Link></footer>
    </div>
  );
}

const DEMO = [
  ['doctor@cura.ai', 'Doctor'],
  ['nurse@cura.ai', 'Nurse'],
  ['patient@cura.ai', 'Patient'],
  ['admin@cura.ai', 'Admin'],
] as const;

export function Login() {
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const go = async (e: string, p: string) => {
    const r = await login(e, p);
    if (r) setErr(r);
    else nav('/app');
  };
  return (
    <div className="min-h-screen">
      <PublicHeader />
      <div className="mx-auto mt-10 max-w-sm card">
        <h1 className="h1 mb-4">Sign in</h1>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void go(email, pw); }}>
          <div><label className="label" htmlFor="em">Email</label><input id="em" className="input" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <div><label className="label" htmlFor="pw">Password</label><input id="pw" type="password" className="input" value={pw} onChange={(e) => setPw(e.target.value)} /></div>
          {err && <p className="text-sm text-critical">{err}</p>}
          <button className="btn-primary w-full">Sign in</button>
        </form>
        <p className="label mt-4">Demo accounts (password Demo@123)</p>
        <div className="flex flex-wrap gap-2">{DEMO.map(([e, l]) => <button key={e} className="btn-ghost" onClick={() => void go(e, 'Demo@123')}>{l}</button>)}</div>
        <p className="muted mt-4">No account? <Link to="/signup" className="text-accent underline">Sign up</Link></p>
      </div>
    </div>
  );
}

export function Signup() {
  const nav = useNavigate();
  const [f, setF] = useState({ name: '', email: '', pw: '', role: 'patient' as Role });
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="min-h-screen">
      <PublicHeader />
      <div className="mx-auto mt-10 max-w-sm card">
        <h1 className="h1 mb-4">Create account</h1>
        <form className="space-y-3" onSubmit={async (e) => {
          e.preventDefault();
          if (!f.name || !f.email.includes('@')) return setMsg('Enter your name and a valid email.');
          const r = await signup(f.name, f.email, f.pw, f.role);
          if (r) return setMsg(r);
          if (f.role === 'patient') nav('/app');
          else setMsg('Staff account created — an administrator must approve it before you can sign in.');
        }}>
          <div><label className="label">Full name</label><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
          <div><label className="label">Email</label><input className="input" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
          <div><label className="label">Password (min 8 characters)</label><input type="password" className="input" value={f.pw} onChange={(e) => setF({ ...f, pw: e.target.value })} /></div>
          <div><label className="label">I am a</label><select className="input" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as Role })}><option value="patient">Patient</option><option value="doctor">Doctor (needs approval)</option><option value="nurse">Nurse (needs approval)</option></select></div>
          {msg && <p className="text-sm text-fg-muted">{msg}</p>}
          <button className="btn-primary w-full">Create account</button>
        </form>
      </div>
    </div>
  );
}

export function ProblemStatement() {
  const db = useDb();
  const count = (src: string) => db.resources.filter((r) => r.meta?.source === src).length;
  const items = [
    { n: 1, title: 'Batch Chest X-Ray Triage', badge: 'Independent project, connected via Cura Nexus', text: 'Multiple images are preprocessed and passed through a reconstruction-based (autoencoder/VAE-style) anomaly-detection model. Each image gets an anomaly score, the batch is ranked, and the highest-priority cases are shown first for radiologist review.', status: count(MODULE1) },
    { n: 2, title: 'Chronic-Disease Follow-up Risk Prioritisation', badge: 'Independent project, connected via Cura Nexus', text: 'Longitudinal patient data (visits, medications, missed appointments, prior readings) is cleaned and feature-engineered, scored by an ML risk model, and shown as a High/Medium/Low priority queue with the contributing factors explained next to the score. Outcomes recorded after outreach feed back into the patient\'s profile.', status: count(MODULE2) },
    { n: 3, title: 'Centralised Record & Interoperability Layer', badge: 'Implemented here', text: 'Results from both modules above are written into one FHIR R4-oriented patient record, which both dashboards can access.', status: -1 },
  ];
  return (
    <div className="min-h-screen">
      <PublicHeader />
      <div className="mx-auto max-w-4xl space-y-4 px-4 py-8">
        <h1 className="h1">Problem statement</h1>
        {items.map((i) => (
          <div key={i.n} className="card">
            <div className="flex flex-wrap items-center gap-2"><span className="font-semibold">{i.n}. {i.title}</span><span className={`badge ${i.n === 3 ? 'border-accent text-accent' : ''}`}>{i.badge}</span></div>
            <p className="muted mt-2">{i.text}</p>
            <p className="mt-2 text-sm">
              {i.status >= 0
                ? <>Status: {i.status ? `connected — ${i.status} result resource(s) in the record` : 'no results imported yet'} · <Link className="text-accent underline" to="/app/modules">Connected Modules</Link></>
                : <>Delivered by: <Link className="text-accent underline" to="/app/patients">Patient record</Link> · <Link className="text-accent underline" to="/app/fhir">FHIR viewer</Link> · <Link className="text-accent underline" to="/app/modules">Connected Modules</Link></>}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
