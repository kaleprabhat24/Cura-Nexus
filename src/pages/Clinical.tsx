import { useState } from 'react';
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { DISEASE_KEYS, RISK_MODELS, defaultInputs, scoreRisk, type DiseaseKey } from '@/engines/risk/models';
import { bmi, bmiCategory, ckdStage, egfrCkdEpi2021, fib4, fib4Interpretation } from '@/engines/calculators';
import { checkInteractions } from '@/engines/pharmacy';
import { DRUGS } from '@/fhir/codes';
import { audit, forPatient, nameOf, patients, update, useDb, uid } from '@/store';
import { downloadText } from '@/lib/download';
import { SevBadge } from './Dashboard';

export function RiskChecks() {
  const [key, setKey] = useState<DiseaseKey>('diabetes');
  const model = RISK_MODELS[key];
  const [inputs, setInputs] = useState<Record<string, number>>(() => defaultInputs(model));
  const pick = (k: DiseaseKey) => { setKey(k); setInputs(defaultInputs(RISK_MODELS[k])); };
  const r = scoreRisk(model, inputs);
  const data = r.contributions.map((c) => ({ name: c.label, value: Math.round(c.logOdds * 100) / 100 }));
  return (
    <div className="space-y-4">
      <h1 className="h1">Risk checks</h1>
      <div className="flex flex-wrap gap-1">{DISEASE_KEYS.map((k) => <button key={k} className={k === key ? 'btn-primary' : 'btn-ghost'} onClick={() => pick(k)}>{RISK_MODELS[k].name}</button>)}</div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card grid gap-3 md:grid-cols-2">
          {model.features.map((f) => (
            <div key={f.key}>
              <label className="label">{f.label}{f.unit ? ` (${f.unit})` : ''}</label>
              {f.kind === 'boolean' ? (
                <select className="input" value={inputs[f.key] ?? 0} onChange={(e) => setInputs({ ...inputs, [f.key]: Number(e.target.value) })}><option value={0}>No</option><option value={1}>Yes</option></select>
              ) : f.kind === 'select' ? (
                <select className="input" value={inputs[f.key] ?? 0} onChange={(e) => setInputs({ ...inputs, [f.key]: Number(e.target.value) })}>{f.options!.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
              ) : (
                <input type="number" className="input" min={f.min} max={f.max} step={f.step ?? 1} value={inputs[f.key] ?? ''} onChange={(e) => setInputs({ ...inputs, [f.key]: Number(e.target.value) })} />
              )}
            </div>
          ))}
        </div>
        <div className="card space-y-3">
          <div className="flex items-center gap-3"><span className="text-4xl font-semibold tabular-nums">{Math.round(r.probability * 100)}%</span><SevBadge t={r.tier === 'high' ? 'High' : r.tier === 'medium' ? 'Medium' : 'Low'} /></div>
          <p className="muted">{model.outcome}. Baseline (reference person): {Math.round(r.baseline * 100)}%.</p>
          <h2 className="h2">Contributing factors (log-odds)</h2>
          <div className="h-64"><ResponsiveContainer><BarChart data={data} layout="vertical" margin={{ left: 40 }}><XAxis type="number" fontSize={11} /><YAxis type="category" dataKey="name" width={150} fontSize={11} /><Tooltip /><Bar dataKey="value">{data.map((d) => <Cell key={d.name} fill={d.value > 0 ? 'rgb(var(--critical))' : 'rgb(var(--low))'} />)}</Bar></BarChart></ResponsiveContainer></div>
          <p className="text-xs text-fg-subtle">Transparent logistic model with illustrative, literature-inspired coefficients. Decision support only — not validated for diagnosis.</p>
        </div>
      </div>
    </div>
  );
}

export function Calculators() {
  const [e, setE] = useState({ cr: 1.0, age: 55, sex: 'male' as 'male' | 'female' });
  const [b, setB] = useState({ w: 70, h: 165 });
  const [f, setF] = useState({ age: 50, ast: 40, alt: 30, plt: 200 });
  const eg = egfrCkdEpi2021(Math.max(0.1, e.cr), Math.max(18, e.age), e.sex);
  const bm = bmi(b.w, Math.max(50, b.h));
  const fb = fib4(f.age, f.ast, Math.max(1, f.alt), Math.max(1, f.plt));
  const num = (v: number, set: (n: number) => void, label: string) => <div><label className="label">{label}</label><input type="number" step="any" className="input" value={v} onChange={(x) => set(Number(x.target.value))} /></div>;
  return (
    <div className="space-y-4">
      <h1 className="h1">Clinical calculators</h1>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card space-y-2">
          <h2 className="h2">eGFR (CKD-EPI 2021)</h2>
          {num(e.cr, (v) => setE({ ...e, cr: v }), 'Creatinine (mg/dL)')}
          {num(e.age, (v) => setE({ ...e, age: v }), 'Age (≥ 18)')}
          <select className="input" value={e.sex} onChange={(x) => setE({ ...e, sex: x.target.value as 'male' | 'female' })}><option value="male">Male</option><option value="female">Female</option></select>
          <p className="text-2xl font-semibold">{eg.toFixed(0)} <span className="muted">mL/min/1.73m² · {ckdStage(eg).stage}</span></p>
          <p className="text-xs text-fg-subtle">142 × min(Scr/κ,1)^α × max(Scr/κ,1)^−1.2 × 0.9938^age × 1.012 [F]. Inker et al., NEJM 2021.</p>
        </div>
        <div className="card space-y-2">
          <h2 className="h2">BMI</h2>
          {num(b.w, (v) => setB({ ...b, w: v }), 'Weight (kg)')}
          {num(b.h, (v) => setB({ ...b, h: v }), 'Height (cm)')}
          <p className="text-2xl font-semibold">{bm.toFixed(1)} <span className="muted">kg/m² · {bmiCategory(bm).label}</span></p>
          <p className="text-xs text-fg-subtle">weight / height². WHO Asian cut-offs (Lancet 2004).</p>
        </div>
        <div className="card space-y-2">
          <h2 className="h2">FIB-4</h2>
          {num(f.age, (v) => setF({ ...f, age: v }), 'Age')}
          {num(f.ast, (v) => setF({ ...f, ast: v }), 'AST (U/L)')}
          {num(f.alt, (v) => setF({ ...f, alt: v }), 'ALT (U/L)')}
          {num(f.plt, (v) => setF({ ...f, plt: v }), 'Platelets (10⁹/L)')}
          <p className="text-2xl font-semibold">{fb.toFixed(2)} <span className="muted">{fib4Interpretation(fb, f.age).label}</span></p>
          <p className="text-xs text-fg-subtle">(age × AST) / (platelets × √ALT). Sterling et al., Hepatology 2006.</p>
        </div>
      </div>
    </div>
  );
}

export function Interactions() {
  const [sel, setSel] = useState<string[]>(['warfarin', 'ibuprofen']);
  const hits = checkInteractions(sel);
  return (
    <div className="space-y-4">
      <h1 className="h1">Drug interaction checker</h1>
      <div className="card">
        <p className="label">Select medicines</p>
        <div className="flex flex-wrap gap-1.5">{DRUGS.map((d) => <button key={d.key} className={sel.includes(d.key) ? 'btn-primary' : 'btn-ghost'} onClick={() => setSel(sel.includes(d.key) ? sel.filter((x) => x !== d.key) : [...sel, d.key])}>{d.name}</button>)}</div>
      </div>
      <div className="card space-y-2">
        {hits.length ? hits.map((h, i) => (
          <div key={i} className="rounded-lg border border-line p-3">
            <div className="flex items-center gap-2 font-medium">{h.drugA.name} + {h.drugB.name} <SevBadge t={h.rule.severity === 'moderate' ? 'Medium' : h.rule.severity === 'minor' ? 'Low' : 'High'} /> <span className="text-xs uppercase text-fg-muted">{h.rule.severity}</span></div>
            <p className="text-sm">{h.rule.effect}</p><p className="muted">Management: {h.rule.management}</p>
          </div>
        )) : <p className="muted">No interactions found in the embedded table for the selected medicines.</p>}
      </div>
    </div>
  );
}

export function Discharge() {
  const db = useDb();
  const pts = patients(db);
  const [pid, setPid] = useState(pts[0]?.id ?? '');
  const [f, setF] = useState({ diagnosis: '', course: 'Treated per protocol, improved and stable for discharge.', followUp: 'OPD review in 2 weeks' });
  const p = pts.find((x) => x.id === pid);
  const mine = forPatient(db, pid);
  const conds = mine.flatMap((r) => (r.resourceType === 'Condition' ? [r.code?.text ?? ''] : []));
  const meds = mine.flatMap((r) => (r.resourceType === 'MedicationRequest' && r.status === 'active' ? [`${r.medicationCodeableConcept?.text} — ${r.dosageInstruction?.[0]?.text ?? ''}`] : []));
  const text = `DISCHARGE SUMMARY\nPatient: ${nameOf(p)} (DOB ${p?.birthDate ?? '—'})\nDate: ${new Date().toISOString().slice(0, 10)}\n\nDiagnosis: ${f.diagnosis || conds[0] || '—'}\nOther problems: ${conds.join(', ') || 'none'}\n\nHospital course: ${f.course}\n\nDischarge medications:\n${meds.map((m) => `• ${m}`).join('\n') || '• none'}\n\nFollow-up: ${f.followUp}\n\nSeek help urgently for chest pain, breathlessness, confusion or fainting (call 108).`;
  const save = () => {
    update((d) => d.resources.push({ resourceType: 'DocumentReference', id: uid('doc'), meta: { source: 'Cura Nexus' }, status: 'current', description: 'Discharge summary', subject: { reference: `Patient/${pid}` }, date: new Date().toISOString(), content: [{ attachment: { contentType: 'text/plain', data: btoa(unescape(encodeURIComponent(text))), title: 'Discharge summary' } }] }));
    audit('discharge.save', `Saved discharge summary for ${nameOf(p)}`);
  };
  return (
    <div className="space-y-4">
      <h1 className="h1">Discharge summary generator</h1>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card space-y-2">
          <label className="label">Patient</label>
          <select className="input" value={pid} onChange={(e) => setPid(e.target.value)}>{pts.map((x) => <option key={x.id} value={x.id}>{nameOf(x)}</option>)}</select>
          <label className="label">Principal diagnosis</label><input className="input" placeholder={conds[0]} value={f.diagnosis} onChange={(e) => setF({ ...f, diagnosis: e.target.value })} />
          <label className="label">Hospital course</label><textarea className="input h-24" value={f.course} onChange={(e) => setF({ ...f, course: e.target.value })} />
          <label className="label">Follow-up</label><input className="input" value={f.followUp} onChange={(e) => setF({ ...f, followUp: e.target.value })} />
        </div>
        <div className="card space-y-2">
          <pre className="whitespace-pre-wrap rounded-lg bg-surface-2 p-3 text-sm">{text}</pre>
          <div className="flex gap-2"><button className="btn-primary" onClick={save}>Save to record</button><button className="btn-ghost" onClick={() => downloadText(`discharge-${pid}.txt`, text)}>Download</button><button className="btn-ghost" onClick={() => window.print()}>Print</button></div>
        </div>
      </div>
    </div>
  );
}
