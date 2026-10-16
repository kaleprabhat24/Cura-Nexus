import { Link } from 'react-router-dom';
import { useDb, patients, forPatient, nameOf, type Db } from '@/store';
import { useSession } from '@/app/auth';
import { MODULE1, MODULE2 } from './Public';
import type { Observation, Patient, RiskAssessment } from '@/fhir/types';

export function cxrResults(db: Db) {
  return db.resources
    .filter((r): r is Observation => r.resourceType === 'Observation' && r.meta?.source === MODULE1)
    .sort((a, b) => (b.valueQuantity?.value ?? 0) - (a.valueQuantity?.value ?? 0));
}

export function chronicResults(db: Db) {
  return db.resources.filter((r): r is RiskAssessment => r.resourceType === 'RiskAssessment' && r.meta?.source === MODULE2);
}

export const tierOf = (r: RiskAssessment) => r.prediction?.[0]?.qualitativeRisk?.text ?? 'Medium';
export const pidOf = (ref?: string) => ref?.split('/')[1] ?? '';

export function Stat({ label, value }: { label: string; value: string | number }) {
  return <div className="card"><div className="text-2xl font-semibold tabular-nums">{value}</div><div className="muted">{label}</div></div>;
}

const sev = (t: string) => (/crit|high/i.test(t) ? 'text-critical border-critical' : /rev|med/i.test(t) ? 'text-medium border-medium' : 'text-low border-low');
export const SevBadge = ({ t }: { t: string }) => <span className={`badge ${sev(t)}`}>{t}</span>;

export function Dashboard() {
  const db = useDb();
  const user = useSession()!;
  if (user.role === 'patient') return <PatientDashboard db={db} pid={user.patientId ?? ''} />;
  const pts = patients(db);
  const byId = new Map(pts.map((p) => [p.id!, p]));
  const cxr = cxrResults(db).slice(0, 5);
  const chronic = chronicResults(db).filter((r) => tierOf(r) === 'High').slice(0, 5);
  return (
    <div className="space-y-4">
      <h1 className="h1">Good day, {user.name}</h1>
      <div className="grid gap-3 md:grid-cols-4">
        <Stat label="Patients" value={pts.length} />
        <Stat label="Appointments booked" value={db.appointments.filter((a) => a.status === 'booked').length} />
        <Stat label="Beds occupied" value={`${db.beds.filter((b) => b.status === 'occupied').length}/${db.beds.length}`} />
        <Stat label="Unpaid invoices" value={db.invoices.filter((i) => i.status === 'unpaid').length} />
      </div>
      <div className="flex flex-wrap gap-2">
        <Link to="/app/patients/new" className="btn-primary">Add patient</Link>
        <Link to="/app/modules" className="btn-ghost">Import module results</Link>
        <Link to="/app/icu" className="btn-ghost">ICU monitor</Link>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="card">
          <h2 className="h2 mb-2">CXR triage worklist <span className="muted font-normal">(Module 1)</span></h2>
          {cxr.length ? (
            <table className="table"><thead><tr><th>Patient</th><th>Score</th><th>Priority</th></tr></thead><tbody>
              {cxr.map((o) => <tr key={o.id}><td><Link className="text-accent" to={`/app/patients/${pidOf(o.subject?.reference)}`}>{nameOf(byId.get(pidOf(o.subject?.reference)))}</Link></td><td className="tabular-nums">{o.valueQuantity?.value}</td><td><SevBadge t={o.valueString ?? '—'} /></td></tr>)}
            </tbody></table>
          ) : <p className="muted">No CXR results yet. <Link className="text-accent underline" to="/app/modules">Import the sample file</Link>.</p>}
        </div>
        <div className="card">
          <h2 className="h2 mb-2">High-risk chronic follow-ups <span className="muted font-normal">(Module 2)</span></h2>
          {chronic.length ? (
            <table className="table"><thead><tr><th>Patient</th><th>Risk</th><th>Action</th></tr></thead><tbody>
              {chronic.map((r) => <tr key={r.id}><td><Link className="text-accent" to={`/app/patients/${pidOf(r.subject.reference)}`}>{nameOf(byId.get(pidOf(r.subject.reference)))}</Link></td><td className="tabular-nums">{Math.round((r.prediction?.[0]?.probabilityDecimal ?? 0) * 100)}%</td><td className="text-xs">{r.mitigation ?? '—'}</td></tr>)}
            </tbody></table>
          ) : <p className="muted">No chronic-care results yet. <Link className="text-accent underline" to="/app/modules">Import the sample file</Link>.</p>}
        </div>
      </div>
      <div className="card">
        <h2 className="h2 mb-2">Recent activity</h2>
        <ul className="space-y-1 text-sm">{db.audit.slice(0, 6).map((a) => <li key={a.id}><span className="text-fg-subtle">{a.at.slice(0, 16).replace('T', ' ')}</span> · {a.user} · {a.detail}</li>)}</ul>
      </div>
    </div>
  );
}

function PatientDashboard({ db, pid }: { db: Db; pid: string }) {
  const p = db.resources.find((r): r is Patient => r.resourceType === 'Patient' && r.id === pid);
  const mine = forPatient(db, pid);
  const conds = mine.filter((r) => r.resourceType === 'Condition');
  const meds = mine.filter((r) => r.resourceType === 'MedicationRequest');
  const latest = mine.filter((r): r is Observation => r.resourceType === 'Observation' && !!r.valueQuantity).sort((a, b) => (b.effectiveDateTime ?? '').localeCompare(a.effectiveDateTime ?? '')).slice(0, 4);
  return (
    <div className="space-y-4">
      <h1 className="h1">Hello, {nameOf(p)}</h1>
      <div className="flex gap-2"><Link to={`/app/patients/${pid}`} className="btn-primary">Open my full record</Link><Link to="/app/appointments" className="btn-ghost">Book appointment</Link><Link to="/app/chat" className="btn-ghost">Ask a health question</Link></div>
      <div className="grid gap-4 md:grid-cols-3">
        <div className="card"><h2 className="h2 mb-2">My conditions</h2><ul className="text-sm">{conds.map((c) => <li key={c.id}>{c.resourceType === 'Condition' ? c.code?.text : ''}</li>)}{!conds.length && <li className="muted">None recorded</li>}</ul></div>
        <div className="card"><h2 className="h2 mb-2">My medicines</h2><ul className="text-sm">{meds.map((m) => <li key={m.id}>{m.resourceType === 'MedicationRequest' ? `${m.medicationCodeableConcept?.text} — ${m.dosageInstruction?.[0]?.text ?? ''}` : ''}</li>)}{!meds.length && <li className="muted">None recorded</li>}</ul></div>
        <div className="card"><h2 className="h2 mb-2">Latest results</h2><ul className="text-sm">{latest.map((o) => <li key={o.id}>{o.code.text}: <b>{o.valueQuantity?.value} {o.valueQuantity?.unit}</b> <span className="text-fg-subtle">({o.effectiveDateTime?.slice(0, 10)})</span></li>)}{!latest.length && <li className="muted">No results yet</li>}</ul></div>
      </div>
      <div className="card"><h2 className="h2 mb-2">My appointments</h2><ul className="text-sm">{db.appointments.filter((a) => a.patientId === pid).map((a) => <li key={a.id}>{a.start.replace('T', ' ')} · {a.doctor} · {a.status}</li>)}</ul></div>
    </div>
  );
}
