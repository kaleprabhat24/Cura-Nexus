import { useState } from 'react';
import { Link } from 'react-router-dom';
import { audit, mrnOfP, nameOf, patients, update, upsertResource, useDb, type Db } from '@/store';
import { jaroWinkler } from '@/engines/jaroWinkler';
import { parseCsv } from '@/engines/csv';
import { cc, SYS } from '@/fhir/codes';
import type { Observation, Patient, RiskAssessment } from '@/fhir/types';
import { readFileText } from '@/lib/download';
import { MODULE1, MODULE2 } from './Public';
import { chronicResults, cxrResults, pidOf, SevBadge } from './Dashboard';

interface Ids { mrn?: string; name?: string; birthDate?: string }

export function matchPatient(db: Db, ids: Ids): Patient | undefined {
  const all = patients(db);
  if (ids.mrn) {
    const hit = all.find((p) => mrnOfP(p) === ids.mrn);
    if (hit) return hit;
  }
  if (ids.name && ids.birthDate) {
    return all.find((p) => p.birthDate === ids.birthDate && jaroWinkler(nameOf(p).toLowerCase(), ids.name!.toLowerCase()) >= 0.9);
  }
  return undefined;
}

interface ImportReport { imported: number; unmatched: string[] }

export function importCxr(db: Db, data: unknown): ImportReport {
  const b = data as { batchId?: string; model?: { name?: string; version?: string }; images?: { patient?: Ids; studyId?: string; anomalyScore?: number; rank?: number; priority?: string; findings?: string }[] };
  if (!Array.isArray(b?.images)) throw new Error('Expected {"images": [...]} (see public/samples/cxr-sample.json)');
  const unmatched: string[] = [];
  const out: Observation[] = [];
  for (const img of b.images) {
    if (typeof img.anomalyScore !== 'number' || !img.studyId) { unmatched.push(`${img.studyId ?? '?'} (missing studyId or anomalyScore)`); continue; }
    const p = matchPatient(db, img.patient ?? {});
    if (!p) { unmatched.push(`${img.studyId} — ${img.patient?.mrn ?? img.patient?.name ?? 'no identifiers'}`); continue; }
    out.push({
      resourceType: 'Observation',
      id: `cxr-${img.studyId}`,
      meta: { source: MODULE1 },
      status: 'preliminary',
      category: [cc(SYS.obsCategory, 'imaging', 'Imaging')],
      code: cc(SYS.cura, 'cxr-anomaly-score', 'Chest X-ray anomaly score', 'CXR anomaly score'),
      subject: { reference: `Patient/${p.id}` },
      effectiveDateTime: new Date().toISOString(),
      valueQuantity: { value: img.anomalyScore, unit: 'score' },
      valueString: img.priority ?? 'Review',
      note: [{ text: `Batch ${b.batchId ?? '—'}, rank ${img.rank ?? '—'}, model ${b.model?.name ?? '?'} v${b.model?.version ?? '?'}${img.findings ? ` — ${img.findings}` : ''}` }],
    });
  }
  // valueString and valueQuantity are both kept so the priority stays visible; store only one value[x] in strict FHIR.
  update((d) => out.forEach((o) => upsertResource(d, o, MODULE1)));
  audit('module1.import', `Imported ${out.length} CXR result(s), ${unmatched.length} unmatched`);
  return { imported: out.length, unmatched };
}

interface ChronicRow { patient?: Ids; riskScore?: number; tier?: string; factors?: { name: string; weight: number }[]; recommendedAction?: string }

export function rowsFromTable(rows: Record<string, unknown>[]): ChronicRow[] {
  const get = (r: Record<string, unknown>, ...keys: string[]) => { for (const k of keys) if (r[k] !== undefined && r[k] !== null && r[k] !== '') return r[k]; return undefined; };
  return rows.map((r) => {
    const f = get(r, 'factors', 'contributing_factors');
    let factors: { name: string; weight: number }[] = [];
    if (Array.isArray(f)) factors = f as typeof factors;
    else if (typeof f === 'string') factors = f.split(/[;|]/).map((x) => x.split(':')).filter((x) => x.length === 2).map(([n, w]) => ({ name: n!.trim(), weight: Number(w) }));
    const score = Number(get(r, 'risk_score', 'riskScore', 'score'));
    return {
      patient: { mrn: get(r, 'mrn', 'patient_id') as string | undefined, name: get(r, 'name', 'patient_name') as string | undefined, birthDate: get(r, 'dob', 'birth_date') as string | undefined },
      riskScore: score > 1 ? score / 100 : score,
      tier: String(get(r, 'tier', 'risk_level') ?? ''),
      factors,
      recommendedAction: get(r, 'action', 'recommended_action') as string | undefined,
    };
  });
}

export function importChronic(db: Db, items: ChronicRow[], model = 'module2-model'): ImportReport {
  const unmatched: string[] = [];
  const out: RiskAssessment[] = [];
  for (const it of items) {
    const p = matchPatient(db, it.patient ?? {});
    if (!p || !Number.isFinite(it.riskScore)) { unmatched.push(it.patient?.mrn ?? it.patient?.name ?? 'unknown'); continue; }
    const tier = /high/i.test(it.tier ?? '') ? 'High' : /low/i.test(it.tier ?? '') ? 'Low' : 'Medium';
    out.push({
      resourceType: 'RiskAssessment',
      id: `chr-${p.id}`,
      meta: { source: MODULE2 },
      status: 'final',
      method: { text: model },
      subject: { reference: `Patient/${p.id}` },
      occurrenceDateTime: new Date().toISOString(),
      prediction: [{ probabilityDecimal: it.riskScore, qualitativeRisk: { text: tier }, rationale: (it.factors ?? []).map((f) => `${f.name} (${f.weight})`).join(', ') }],
      mitigation: it.recommendedAction,
    });
  }
  update((d) => out.forEach((o) => upsertResource(d, o, MODULE2)));
  audit('module2.import', `Imported ${out.length} chronic-care result(s), ${unmatched.length} unmatched`);
  return { imported: out.length, unmatched };
}

export function Modules() {
  const db = useDb();
  const byId = new Map(patients(db).map((p) => [p.id!, p]));
  const [text1, setText1] = useState('');
  const [text2, setText2] = useState('');
  const [msg, setMsg] = useState('');
  const [sb, setSb] = useState({ url: '', key: '', table: '' });
  const report = (r: ImportReport) => setMsg(`Imported ${r.imported} result(s).${r.unmatched.length ? ` Unmatched (no patient found): ${r.unmatched.join('; ')}` : ''}`);
  const safe = (fn: () => void) => { try { fn(); } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); } };
  const chronicFromText = (t: string, name: string) => {
    if (name.endsWith('.csv') || !t.trim().startsWith('{') && !t.trim().startsWith('[')) return report(importChronic(db, rowsFromTable(parseCsv(t).rows)));
    const j = JSON.parse(t) as { patients?: ChronicRow[]; model?: { name?: string } } | Record<string, unknown>[];
    if (Array.isArray(j)) return report(importChronic(db, rowsFromTable(j)));
    if (!Array.isArray(j.patients)) throw new Error('Expected {"patients": [...]} or a CSV file');
    report(importChronic(db, j.patients, j.model?.name));
  };
  const sample = async (file: string) => (await fetch(`${import.meta.env.BASE_URL}samples/${file}`)).text();
  const syncSupabase = async () => {
    setMsg('Fetching from Supabase…');
    try {
      const res = await fetch(`${sb.url.replace(/\/+$/, '')}/rest/v1/${encodeURIComponent(sb.table)}?select=*`, { headers: { apikey: sb.key, Authorization: `Bearer ${sb.key}` } });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${res.status === 401 || res.status === 403 ? 'check the anon key and that RLS allows SELECT for anon' : await res.text()}`);
      report(importChronic(db, rowsFromTable((await res.json()) as Record<string, unknown>[]), `supabase:${sb.table}`));
    } catch (e) {
      setMsg(`Supabase sync failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };
  const cxr = cxrResults(db);
  const chr = chronicResults(db);
  return (
    <div className="space-y-4">
      <h1 className="h1">Connected modules</h1>
      <p className="muted">Modules 1 and 2 are independent projects with their own trained models. Cura Nexus only receives, matches and stores their results in the FHIR record — it does not score anything itself.</p>
      {msg && <div className="card text-sm">{msg}</div>}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card space-y-2">
          <h2 className="h2">Module 1 — CXR triage <span className="badge ml-1">localStorage-based</span></h2>
          <p className="muted">Export the results from Module 1 as JSON and import them here. Status: {cxr.length ? `${cxr.length} result(s) in the record` : 'not connected yet'}.</p>
          <input type="file" accept=".json" onChange={async (e) => { const f = e.target.files?.[0]; if (f) { const t = await readFileText(f); safe(() => report(importCxr(db, JSON.parse(t)))); } }} />
          <textarea className="input h-24 font-mono text-xs" placeholder="…or paste JSON" value={text1} onChange={(e) => setText1(e.target.value)} />
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary" disabled={!text1} onClick={() => safe(() => report(importCxr(db, JSON.parse(text1))))}>Import pasted JSON</button>
            <button className="btn-ghost" onClick={async () => { const t = await sample('cxr-sample.json'); safe(() => report(importCxr(db, JSON.parse(t)))); }}>Import sample file</button>
            <a className="btn-ghost" href={`${import.meta.env.BASE_URL}samples/cxr-sample.json`} download>Download sample</a>
          </div>
        </div>
        <div className="card space-y-2">
          <h2 className="h2">Module 2 — Chronic care <span className="badge ml-1">Supabase-based</span></h2>
          <p className="muted">Import JSON/CSV, or read the module's Supabase table directly. Status: {chr.length ? `${chr.length} result(s) in the record` : 'not connected yet'}.</p>
          <input type="file" accept=".json,.csv" onChange={async (e) => { const f = e.target.files?.[0]; if (f) { const t = await readFileText(f); safe(() => chronicFromText(t, f.name)); } }} />
          <textarea className="input h-24 font-mono text-xs" placeholder="…or paste JSON / CSV" value={text2} onChange={(e) => setText2(e.target.value)} />
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary" disabled={!text2} onClick={() => safe(() => chronicFromText(text2, 'paste'))}>Import pasted data</button>
            <button className="btn-ghost" onClick={async () => { const t = await sample('chronic-sample.json'); safe(() => chronicFromText(t, 'chronic-sample.json')); }}>Import sample file</button>
            <a className="btn-ghost" href={`${import.meta.env.BASE_URL}samples/chronic-sample.csv`} download>Sample CSV</a>
          </div>
          <div className="grid gap-2 border-t border-line pt-2 md:grid-cols-3">
            <input className="input" placeholder="Supabase URL" value={sb.url} onChange={(e) => setSb({ ...sb, url: e.target.value })} />
            <input className="input" placeholder="anon key" value={sb.key} onChange={(e) => setSb({ ...sb, key: e.target.value })} />
            <input className="input" placeholder="table name" value={sb.table} onChange={(e) => setSb({ ...sb, table: e.target.value })} />
          </div>
          <button className="btn-ghost" disabled={!sb.url || !sb.key || !sb.table} onClick={() => void syncSupabase()}>Sync from Supabase</button>
          <p className="text-xs text-fg-subtle">Expected columns: mrn (or name + dob), risk_score, tier, factors ("name:weight;…"), action.</p>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-0"><table className="table"><thead><tr><th>Patient</th><th>CXR score</th><th>Priority</th></tr></thead><tbody>
          {cxr.map((o) => <tr key={o.id}><td><Link className="text-accent" to={`/app/patients/${pidOf(o.subject?.reference)}`}>{nameOf(byId.get(pidOf(o.subject?.reference)))}</Link></td><td>{o.valueQuantity?.value}</td><td><SevBadge t={o.valueString ?? '—'} /></td></tr>)}
          {!cxr.length && <tr><td colSpan={3} className="muted">No CXR results imported.</td></tr>}
        </tbody></table></div>
        <div className="card p-0"><table className="table"><thead><tr><th>Patient</th><th>Risk</th><th>Tier</th><th>Factors</th></tr></thead><tbody>
          {chr.map((r) => <tr key={r.id}><td><Link className="text-accent" to={`/app/patients/${pidOf(r.subject.reference)}`}>{nameOf(byId.get(pidOf(r.subject.reference)))}</Link></td><td>{Math.round((r.prediction?.[0]?.probabilityDecimal ?? 0) * 100)}%</td><td><SevBadge t={r.prediction?.[0]?.qualitativeRisk?.text ?? '—'} /></td><td className="text-xs">{r.prediction?.[0]?.rationale}</td></tr>)}
          {!chr.length && <tr><td colSpan={4} className="muted">No chronic-care results imported.</td></tr>}
        </tbody></table></div>
      </div>
    </div>
  );
}
