import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { audit, forPatient, makeConsent, mrnOfP, nameOf, patients, phoneOfP, update, upsertResource, useDb, uid, type Db } from '@/store';
import { jaroWinkler } from '@/engines/jaroWinkler';
import { SYS } from '@/fhir/codes';
import type { Bundle, Consent, FhirResource, Observation, Patient } from '@/fhir/types';
import { downloadJson } from '@/lib/download';
import { useSession } from '@/app/auth';
import { MODULE1, MODULE2 } from './Public';

const age = (b?: string) => (b ? Math.floor((Date.now() - new Date(b).getTime()) / 31_557_600_000) : '—');

export function PatientList() {
  const db = useDb();
  const [q, setQ] = useState('');
  const list = patients(db).filter((p) => `${nameOf(p)} ${mrnOfP(p)} ${phoneOfP(p)}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="h1">Patients <span className="muted">({list.length})</span></h1>
        <div className="flex gap-2"><input className="input w-64" placeholder="Search name, MRN, phone" value={q} onChange={(e) => setQ(e.target.value)} /><Link to="/app/patients/new" className="btn-primary">Add patient</Link></div>
      </div>
      <div className="card overflow-auto p-0">
        <table className="table"><thead><tr><th>Name</th><th>MRN</th><th>Age</th><th>Gender</th><th>Phone</th><th>City</th><th>Status</th></tr></thead><tbody>
          {list.map((p) => <tr key={p.id}><td><Link className="font-medium text-accent" to={`/app/patients/${p.id}`}>{nameOf(p)}</Link></td><td className="font-mono text-xs">{mrnOfP(p)}</td><td>{age(p.birthDate)}</td><td className="capitalize">{p.gender ?? '—'}</td><td>{phoneOfP(p)}</td><td>{p.address?.[0]?.city ?? '—'}</td><td>{p.active === false ? <span className="badge">inactive</span> : <span className="badge text-low border-low">active</span>}</td></tr>)}
          {!list.length && <tr><td colSpan={7} className="muted">No patients match.</td></tr>}
        </tbody></table>
      </div>
    </div>
  );
}

interface Form { given: string; family: string; gender: string; birthDate: string; phone: string; city: string; abha: string }

export function duplicateScore(a: Form, p: Patient): number {
  const name = jaroWinkler(`${a.given} ${a.family}`.toLowerCase(), nameOf(p).toLowerCase());
  const dob = a.birthDate && p.birthDate ? (a.birthDate === p.birthDate ? 1 : a.birthDate.slice(0, 4) === p.birthDate.slice(0, 4) ? 0.5 : 0) : 0;
  const d = (s: string) => s.replace(/\D/g, '').slice(-10);
  const phone = a.phone && d(a.phone) === d(phoneOfP(p)) ? 1 : 0;
  return 0.5 * name + 0.3 * dob + 0.2 * phone;
}

export function PatientForm() {
  const { id } = useParams();
  const db = useDb();
  const nav = useNavigate();
  const existing = patients(db).find((p) => p.id === id);
  const [f, setF] = useState<Form>({
    given: existing?.name?.[0]?.given?.[0] ?? '',
    family: existing?.name?.[0]?.family ?? '',
    gender: existing?.gender ?? 'female',
    birthDate: existing?.birthDate ?? '',
    phone: phoneOfP(existing),
    city: existing?.address?.[0]?.city ?? '',
    abha: existing?.identifier?.find((i) => i.system === SYS.abha)?.value ?? '',
  });
  const [errors, setErrors] = useState<string[]>([]);
  const [dups, setDups] = useState<{ p: Patient; score: number }[] | null>(null);

  const validate = () => {
    const e: string[] = [];
    if (!f.given.trim() || !f.family.trim()) e.push('Given and family name are required.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f.birthDate) || new Date(f.birthDate) > new Date()) e.push('Enter a valid date of birth (not in the future).');
    if (f.phone && f.phone.replace(/\D/g, '').length < 10) e.push('Phone needs at least 10 digits.');
    if (f.abha && f.abha.replace(/\D/g, '').length !== 14) e.push('ABHA number must have 14 digits.');
    setErrors(e);
    return !e.length;
  };

  const save = () => {
    const pid = existing?.id ?? uid('pt');
    const mrn = existing ? mrnOfP(existing) : `CN-${String(patients(db).length + 1).padStart(6, '0')}`;
    const p: Patient = {
      ...existing,
      resourceType: 'Patient',
      id: pid,
      active: existing?.active ?? true,
      identifier: [{ system: SYS.mrn, value: mrn }, ...(f.abha ? [{ system: SYS.abha, value: f.abha.replace(/\D/g, '') }] : [])],
      name: [{ use: 'official', given: [f.given.trim()], family: f.family.trim() }],
      gender: f.gender as Patient['gender'],
      birthDate: f.birthDate,
      telecom: f.phone ? [{ system: 'phone', value: f.phone }] : [],
      address: f.city ? [{ city: f.city, country: 'IN' }] : undefined,
    };
    update((d) => {
      upsertResource(d, p, 'Cura Nexus registration');
      if (!existing) d.resources.push(makeConsent(pid));
    });
    audit(existing ? 'patient.update' : 'patient.create', `${existing ? 'Updated' : 'Registered'} ${nameOf(p)} (${mrn})`);
    nav(`/app/patients/${pid}`);
  };

  const submit = () => {
    if (!validate()) return;
    if (!existing && dups === null) {
      const found = patients(db).map((p) => ({ p, score: duplicateScore(f, p) })).filter((x) => x.score >= 0.75).sort((a, b) => b.score - a.score);
      if (found.length) return setDups(found);
    }
    save();
  };

  const field = (k: keyof Form, label: string, type = 'text') => (
    <div><label className="label">{label}</label><input type={type} className="input" value={f[k]} onChange={(e) => { setF({ ...f, [k]: e.target.value }); setDups(null); }} /></div>
  );
  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="h1">{existing ? 'Edit patient' : 'Add patient'}</h1>
      <div className="card grid gap-3 md:grid-cols-2">
        {field('given', 'Given name')}
        {field('family', 'Family name')}
        <div><label className="label">Gender</label><select className="input" value={f.gender} onChange={(e) => setF({ ...f, gender: e.target.value })}><option value="female">Female</option><option value="male">Male</option><option value="other">Other</option></select></div>
        {field('birthDate', 'Date of birth', 'date')}
        {field('phone', 'Phone')}
        {field('city', 'City')}
        {field('abha', 'ABHA number (optional, 14 digits)')}
      </div>
      {errors.length > 0 && <ul className="card border-critical text-sm text-critical">{errors.map((e) => <li key={e}>{e}</li>)}</ul>}
      {dups && dups.length > 0 && (
        <div className="card border-medium">
          <h2 className="h2 mb-2">Possible duplicates found</h2>
          <ul className="space-y-2 text-sm">{dups.map(({ p, score }) => <li key={p.id} className="flex items-center justify-between gap-2"><span>{nameOf(p)} · {p.birthDate} · {phoneOfP(p)} · match {Math.round(score * 100)}%</span><Link className="btn-ghost" to={`/app/patients/${p.id}`}>This is the same patient</Link></li>)}</ul>
          <button className="btn-primary mt-3" onClick={save}>Create new patient anyway</button>
        </div>
      )}
      <div className="flex gap-2"><button className="btn-primary" onClick={submit}>{existing ? 'Save changes' : 'Check duplicates & save'}</button><button className="btn-ghost" onClick={() => nav(-1)}>Cancel</button></div>
    </div>
  );
}

function dateOf(r: FhirResource): string {
  const o = r as { effectiveDateTime?: string; onsetDateTime?: string; authoredOn?: string; dateTime?: string; occurrenceDateTime?: string };
  return o.effectiveDateTime ?? o.onsetDateTime ?? o.authoredOn ?? o.occurrenceDateTime ?? o.dateTime ?? r.meta?.lastUpdated ?? '';
}

function describe(r: FhirResource): string {
  switch (r.resourceType) {
    case 'Observation': return `${r.code.text}: ${r.valueQuantity ? `${r.valueQuantity.value} ${r.valueQuantity.unit ?? ''}` : r.valueString ?? ''}`;
    case 'Condition': return `Condition: ${r.code?.text}`;
    case 'MedicationRequest': return `Medication: ${r.medicationCodeableConcept?.text} (${r.status})`;
    case 'Consent': return `Consent ${r.status}: ${r.provision?.actor?.[0]?.reference.display ?? 'care team'}`;
    case 'RiskAssessment': return `Chronic follow-up risk: ${r.prediction?.[0]?.qualitativeRisk?.text} (${Math.round((r.prediction?.[0]?.probabilityDecimal ?? 0) * 100)}%)`;
    case 'DocumentReference': return `Document: ${r.description ?? 'note'}`;
    default: return r.resourceType;
  }
}

export function sourceBadge(src?: string) {
  const s = src ?? 'Cura Nexus';
  const cls = s === MODULE1 ? 'border-info text-info' : s === MODULE2 ? 'border-high text-high' : '';
  return <span className={`badge ${cls}`}>{s}</span>;
}

export function bundleFor(db: Db, pid: string): Bundle {
  const p = patients(db).find((x) => x.id === pid);
  return {
    resourceType: 'Bundle',
    type: 'collection',
    timestamp: new Date().toISOString(),
    entry: [p, ...forPatient(db, pid)].filter(Boolean).map((r) => ({ fullUrl: `${r!.resourceType}/${r!.id}`, resource: r! })),
  };
}

export function PatientRecord() {
  const { id = '' } = useParams();
  const db = useDb();
  const user = useSession()!;
  const p = patients(db).find((x) => x.id === id);
  const all = useMemo(() => forPatient(db, id), [db, id]);
  const [tab, setTab] = useState<'timeline' | 'vitals' | 'consent' | 'audit'>('timeline');
  if (!p) return <div className="card">Patient not found. <Link className="text-accent underline" to="/app/patients">Back to list</Link></div>;
  if (user.role === 'patient' && user.patientId !== id) return <div className="card">You can only view your own record.</div>;
  const consents = all.filter((r): r is Consent => r.resourceType === 'Consent');
  const hasConsent = consents.some((c) => c.status === 'active');
  const restricted = user.role !== 'patient' && !hasConsent;
  const timeline = [...all].sort((a, b) => dateOf(b).localeCompare(dateOf(a)));
  const vitals = all.filter((r): r is Observation => r.resourceType === 'Observation' && !!r.valueQuantity && ['8480-6', '8462-4', '8867-4'].includes(r.code.coding?.[0]?.code ?? ''));
  const byDate = new Map<string, Record<string, number | string>>();
  for (const o of vitals) {
    const d = o.effectiveDateTime?.slice(0, 10) ?? '';
    const row = byDate.get(d) ?? { date: d };
    row[o.code.text ?? ''] = o.valueQuantity!.value!;
    byDate.set(d, row);
  }
  const chart = [...byDate.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const exportBundle = () => {
    downloadJson(`patient-${id}-bundle.json`, bundleFor(db, id));
    audit('fhir.export', `Exported FHIR Bundle for ${nameOf(p)}`);
  };
  const setConsent = (grant: boolean) => {
    update((d) => {
      if (grant) d.resources.push(makeConsent(id));
      else d.resources.forEach((r) => { if (r.resourceType === 'Consent' && r.patient?.reference === `Patient/${id}` && r.status === 'active') r.status = 'inactive'; });
    });
    audit(grant ? 'consent.grant' : 'consent.revoke', `${grant ? 'Granted' : 'Revoked'} treatment consent for ${nameOf(p)}`);
  };
  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="h1">{nameOf(p)}</h1>
          <p className="muted">{p.gender} · {age(p.birthDate)} y · DOB {p.birthDate} · MRN {mrnOfP(p)} · {phoneOfP(p)}{p.identifier?.find((i) => i.system === SYS.abha) ? ` · ABHA ${p.identifier.find((i) => i.system === SYS.abha)!.value}` : ''}</p>
          <div className="mt-2 flex flex-wrap gap-1">{[...new Set(all.map((r) => r.meta?.source ?? 'Cura Nexus'))].map((s) => <span key={s}>{sourceBadge(s)}</span>)}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          {user.role !== 'patient' && <Link className="btn-ghost" to={`/app/patients/${id}/edit`}>Edit</Link>}
          <button className="btn-primary" onClick={exportBundle}>Export FHIR Bundle</button>
        </div>
      </div>
      {restricted ? (
        <div className="card border-critical">
          <p className="text-sm">No active consent — clinical data is hidden. Consent must be granted by the patient (or recorded at the front desk).</p>
          <button className="btn-primary mt-2" onClick={() => setConsent(true)}>Record consent on patient's behalf</button>
        </div>
      ) : (
        <>
          <div className="flex gap-1">{(['timeline', 'vitals', 'consent', 'audit'] as const).map((t) => <button key={t} className={t === tab ? 'btn-primary' : 'btn-ghost'} onClick={() => setTab(t)}>{t[0]!.toUpperCase() + t.slice(1)}</button>)}</div>
          {tab === 'timeline' && (
            <div className="card p-0"><table className="table"><thead><tr><th>Date</th><th>Entry</th><th>Type</th><th>Source</th></tr></thead><tbody>
              {timeline.map((r) => <tr key={`${r.resourceType}/${r.id}`}><td className="whitespace-nowrap tabular-nums">{dateOf(r).slice(0, 10)}</td><td>{describe(r)}</td><td className="text-xs text-fg-muted">{r.resourceType}</td><td>{sourceBadge(r.meta?.source)}</td></tr>)}
            </tbody></table></div>
          )}
          {tab === 'vitals' && (
            <div className="card h-80">
              {chart.length ? (
                <ResponsiveContainer><LineChart data={chart}><CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" /><XAxis dataKey="date" fontSize={11} /><YAxis fontSize={11} /><Tooltip /><Legend /><Line dataKey="SBP" stroke="rgb(var(--critical))" /><Line dataKey="DBP" stroke="rgb(var(--info))" /><Line dataKey="HR" stroke="rgb(var(--accent))" /></LineChart></ResponsiveContainer>
              ) : <p className="muted">No vital signs recorded.</p>}
            </div>
          )}
          {tab === 'consent' && (
            <div className="card space-y-2">
              {consents.map((c) => <div key={c.id} className="flex justify-between text-sm"><span>{c.dateTime?.slice(0, 10)} · {c.provision?.purpose?.[0]?.display} · {c.provision?.actor?.[0]?.reference.display ?? 'Care team'}</span><span className={`badge ${c.status === 'active' ? 'text-low border-low' : ''}`}>{c.status}</span></div>)}
              <div className="flex gap-2 pt-2">{hasConsent ? <button className="btn-danger" onClick={() => setConsent(false)}>Revoke consent</button> : <button className="btn-primary" onClick={() => setConsent(true)}>Grant consent</button>}</div>
            </div>
          )}
          {tab === 'audit' && (
            <div className="card"><ul className="space-y-1 text-sm">{db.audit.filter((a) => a.detail.includes(nameOf(p))).map((a) => <li key={a.id}>{a.at.slice(0, 16).replace('T', ' ')} · {a.user} · {a.action} · {a.detail}</li>)}</ul></div>
          )}
        </>
      )}
    </div>
  );
}
