import { useEffect, useState } from 'react';
import { Line, LineChart, ResponsiveContainer, YAxis } from 'recharts';
import { audit, nameOf, patients, update, useDb, uid, type Bed } from '@/store';
import { useSession } from '@/app/auth';
import { news2 } from '@/engines/calculators';
import { fmtINR } from '@/lib/format';
import { SevBadge } from './Dashboard';

interface Vit { hr: number; spo2: number; sbp: number; rr: number; temp: number }

export function Icu() {
  const db = useDb();
  const icu = db.beds.filter((b) => b.ward === 'ICU' && b.patientId);
  const byId = new Map(patients(db).map((p) => [p.id!, p]));
  const [hist, setHist] = useState<Record<string, Vit[]>>({});
  useEffect(() => {
    const tick = () =>
      setHist((h) => {
        const next: Record<string, Vit[]> = {};
        icu.forEach((b, i) => {
          const prev = h[b.id]?.at(-1) ?? { hr: 82 + i * 4, spo2: 97 - (i === 1 ? 4 : 0), sbp: 124, rr: 16, temp: 37 };
          const j = (v: number, s: number) => v + (Math.random() - 0.5) * s;
          const drift = i === 1 ? 0.6 : 0;
          const v: Vit = { hr: Math.round(j(prev.hr + drift, 4)), spo2: Math.min(100, Math.round(j(prev.spo2 - drift * 0.1, 1.2))), sbp: Math.round(j(prev.sbp - drift, 5)), rr: Math.max(6, Math.round(j(prev.rr + drift * 0.15, 1.5))), temp: Math.round(j(prev.temp, 0.15) * 10) / 10 };
          next[b.id] = [...(h[b.id] ?? []), v].slice(-30);
        });
        return next;
      });
    tick();
    const t = setInterval(tick, 2000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [icu.length]);
  return (
    <div className="space-y-4">
      <h1 className="h1">ICU monitor <span className="muted">(simulated live vitals, NEWS2 alerting)</span></h1>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {icu.map((b) => {
          const s = hist[b.id] ?? [];
          const v = s.at(-1);
          const n = v ? news2({ respRate: v.rr, spo2: v.spo2, onOxygen: false, sbp: v.sbp, pulse: v.hr, consciousness: 'A', temp: v.temp }) : null;
          const alert = n && n.total >= 5;
          return (
            <div key={b.id} className={`card ${alert ? 'border-critical' : ''}`}>
              <div className="flex items-center justify-between"><span className="font-medium">{b.label} · {nameOf(byId.get(b.patientId!))}</span>{n && <SevBadge t={n.total >= 7 ? 'Critical' : n.total >= 5 ? 'High' : n.total >= 1 ? 'Medium' : 'Low'} />}</div>
              {v && <div className="mt-2 grid grid-cols-5 gap-1 text-center text-xs tabular-nums">{[['HR', v.hr], ['SpO₂', v.spo2], ['SBP', v.sbp], ['RR', v.rr], ['Temp', v.temp]].map(([k, x]) => <div key={k as string}><div className="text-fg-subtle">{k}</div><div className="text-base font-semibold">{x}</div></div>)}</div>}
              <div className="h-16"><ResponsiveContainer><LineChart data={s}><YAxis hide domain={['auto', 'auto']} /><Line dataKey="hr" stroke="rgb(var(--accent))" dot={false} isAnimationActive={false} /></LineChart></ResponsiveContainer></div>
              {n && <p className={`text-xs ${alert ? 'font-medium text-critical' : 'text-fg-muted'}`}>NEWS2 {n.total} — {n.response}</p>}
            </div>
          );
        })}
        {!icu.length && <p className="muted">No ICU beds occupied.</p>}
      </div>
    </div>
  );
}

export function Beds() {
  const db = useDb();
  const pts = patients(db);
  const byId = new Map(pts.map((p) => [p.id!, p]));
  const [admit, setAdmit] = useState<{ bed: Bed; pid: string } | null>(null);
  const setBed = (id: string, patch: Partial<Bed>, msg: string) => { update((d) => { const b = d.beds.find((x) => x.id === id)!; Object.assign(b, patch); if (patch.status !== 'occupied') delete b.patientId; }); audit('bed', msg); };
  const wards = [...new Set(db.beds.map((b) => b.ward))];
  return (
    <div className="space-y-4">
      <h1 className="h1">Bed capacity board</h1>
      <div className="grid gap-3 md:grid-cols-3">{wards.map((w) => { const bs = db.beds.filter((b) => b.ward === w); return <div key={w} className="card"><div className="font-medium">{w}</div><div className="muted">{bs.filter((b) => b.status === 'occupied').length} occupied · {bs.filter((b) => b.status === 'free').length} free · {bs.filter((b) => b.status === 'cleaning').length} cleaning</div></div>; })}</div>
      {wards.map((w) => (
        <div key={w}><h2 className="h2 mb-2">{w}</h2><div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-8">
          {db.beds.filter((b) => b.ward === w).map((b) => (
            <div key={b.id} className={`card p-3 text-sm ${b.status === 'occupied' ? 'border-accent' : b.status === 'cleaning' ? 'border-medium' : ''}`}>
              <div className="font-medium">{b.label}</div>
              <div className="truncate text-xs text-fg-muted">{b.status === 'occupied' ? nameOf(byId.get(b.patientId!)) : b.status}</div>
              <div className="mt-2">
                {b.status === 'occupied' && <button className="btn-ghost w-full text-xs" onClick={() => setBed(b.id, { status: 'cleaning' }, `Discharged ${nameOf(byId.get(b.patientId!))} from ${b.label}`)}>Discharge</button>}
                {b.status === 'cleaning' && <button className="btn-ghost w-full text-xs" onClick={() => setBed(b.id, { status: 'free' }, `${b.label} cleaned`)}>Mark clean</button>}
                {b.status === 'free' && <button className="btn-primary w-full text-xs" onClick={() => setAdmit({ bed: b, pid: pts[0]?.id ?? '' })}>Admit</button>}
              </div>
            </div>
          ))}
        </div></div>
      ))}
      {admit && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" role="dialog">
          <div className="card w-full max-w-sm space-y-3">
            <h2 className="h2">Admit to {admit.bed.label}</h2>
            <select className="input" value={admit.pid} onChange={(e) => setAdmit({ ...admit, pid: e.target.value })}>{pts.map((p) => <option key={p.id} value={p.id}>{nameOf(p)}</option>)}</select>
            <div className="flex gap-2"><button className="btn-primary" onClick={() => { update((d) => { const b = d.beds.find((x) => x.id === admit.bed.id)!; b.status = 'occupied'; b.patientId = admit.pid; }); audit('bed', `Admitted ${nameOf(byId.get(admit.pid))} to ${admit.bed.label}`); setAdmit(null); }}>Admit</button><button className="btn-ghost" onClick={() => setAdmit(null)}>Cancel</button></div>
          </div>
        </div>
      )}
    </div>
  );
}

export function Appointments() {
  const db = useDb();
  const user = useSession()!;
  const pts = patients(db);
  const byId = new Map(pts.map((p) => [p.id!, p]));
  const mineOnly = user.role === 'patient';
  const [f, setF] = useState({ pid: mineOnly ? user.patientId ?? '' : pts[0]?.id ?? '', start: '', doctor: 'Dr Ananya Iyer', reason: 'Follow-up' });
  const list = db.appointments.filter((a) => !mineOnly || a.patientId === user.patientId).sort((a, b) => a.start.localeCompare(b.start));
  const book = () => {
    if (!f.start || new Date(f.start) < new Date()) return alert('Choose a future date and time.');
    update((d) => d.appointments.push({ id: uid('ap'), patientId: f.pid, doctor: f.doctor, start: f.start, reason: f.reason, status: 'booked' }));
    audit('appointment.book', `Booked ${f.doctor} for ${nameOf(byId.get(f.pid))} at ${f.start}`);
  };
  return (
    <div className="space-y-4">
      <h1 className="h1">Appointments</h1>
      <div className="card grid gap-2 md:grid-cols-5">
        {!mineOnly && <select className="input" value={f.pid} onChange={(e) => setF({ ...f, pid: e.target.value })}>{pts.map((p) => <option key={p.id} value={p.id}>{nameOf(p)}</option>)}</select>}
        <select className="input" value={f.doctor} onChange={(e) => setF({ ...f, doctor: e.target.value })}>{['Dr Ananya Iyer', 'Dr Rahul Menon', 'Dr Farah Siddiqui'].map((d) => <option key={d}>{d}</option>)}</select>
        <input type="datetime-local" className="input" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} />
        <input className="input" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} />
        <button className="btn-primary" onClick={book}>Book</button>
      </div>
      <div className="card p-0"><table className="table"><thead><tr><th>When</th><th>Patient</th><th>Doctor</th><th>Reason</th><th>Status</th><th /></tr></thead><tbody>
        {list.map((a) => <tr key={a.id}><td className="tabular-nums">{a.start.replace('T', ' ')}</td><td>{nameOf(byId.get(a.patientId))}</td><td>{a.doctor}</td><td>{a.reason}</td><td>{a.status}</td><td>{a.status === 'booked' && <button className="btn-ghost text-xs" onClick={() => { update((d) => { d.appointments.find((x) => x.id === a.id)!.status = 'cancelled'; }); audit('appointment.cancel', `Cancelled appointment for ${nameOf(byId.get(a.patientId))}`); }}>Cancel</button>}</td></tr>)}
        {!list.length && <tr><td colSpan={6} className="muted">No appointments.</td></tr>}
      </tbody></table></div>
    </div>
  );
}

const SERVICES = [['OPD consultation', 800], ['HbA1c', 550], ['Lipid panel', 700], ['Chest X-ray', 600], ['ECG', 400], ['Echocardiogram', 3500]] as const;

export function Billing() {
  const db = useDb();
  const user = useSession()!;
  const pts = patients(db);
  const byId = new Map(pts.map((p) => [p.id!, p]));
  const [pid, setPid] = useState(pts[0]?.id ?? '');
  const [items, setItems] = useState<string[]>(['OPD consultation']);
  const list = db.invoices.filter((i) => user.role !== 'patient' || i.patientId === user.patientId);
  const total = (i: { items: { amount: number }[] }) => i.items.reduce((s, x) => s + x.amount, 0);
  return (
    <div className="space-y-4">
      <h1 className="h1">Billing</h1>
      {user.role !== 'patient' && (
        <div className="card space-y-2">
          <h2 className="h2">New invoice</h2>
          <select className="input max-w-sm" value={pid} onChange={(e) => setPid(e.target.value)}>{pts.map((p) => <option key={p.id} value={p.id}>{nameOf(p)}</option>)}</select>
          <div className="flex flex-wrap gap-1.5">{SERVICES.map(([n, a]) => <button key={n} className={items.includes(n) ? 'btn-primary' : 'btn-ghost'} onClick={() => setItems(items.includes(n) ? items.filter((x) => x !== n) : [...items, n])}>{n} · {fmtINR(a)}</button>)}</div>
          <button className="btn-primary" disabled={!items.length} onClick={() => { const id = `INV-${1000 + db.invoices.length}`; update((d) => d.invoices.unshift({ id, patientId: pid, date: new Date().toISOString().slice(0, 10), items: SERVICES.filter(([n]) => items.includes(n)).map(([name, amount]) => ({ name, amount })), status: 'unpaid' })); audit('invoice.create', `Created ${id} for ${nameOf(byId.get(pid))}`); }}>Create invoice</button>
        </div>
      )}
      <div className="card p-0"><table className="table"><thead><tr><th>Invoice</th><th>Date</th><th>Patient</th><th>Items</th><th>Total</th><th>Status</th><th /></tr></thead><tbody>
        {list.map((i) => <tr key={i.id}><td className="font-mono text-xs">{i.id}</td><td>{i.date}</td><td>{nameOf(byId.get(i.patientId))}</td><td className="text-xs">{i.items.map((x) => x.name).join(', ')}</td><td className="tabular-nums">{fmtINR(total(i))}</td><td><span className={`badge ${i.status === 'paid' ? 'text-low border-low' : 'text-medium border-medium'}`}>{i.status}</span></td><td>{i.status === 'unpaid' && <button className="btn-ghost text-xs" onClick={() => { update((d) => { d.invoices.find((x) => x.id === i.id)!.status = 'paid'; }); audit('invoice.pay', `Marked ${i.id} paid (simulated)`); }}>Mark paid</button>}</td></tr>)}
      </tbody></table></div>
    </div>
  );
}
