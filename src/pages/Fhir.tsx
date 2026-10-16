import { useState } from 'react';
import { audit, nameOf, patients, update, upsertResource, useDb } from '@/store';
import { validateResource } from '@/fhir/validator';
import type { Bundle, FhirResource } from '@/fhir/types';
import { copyText, downloadJson, readFileText } from '@/lib/download';
import { bundleFor } from './Patients';

export function FhirViewer() {
  const db = useDb();
  const pts = patients(db);
  const [type, setType] = useState('Patient');
  const [pid, setPid] = useState('');
  const [sel, setSel] = useState<FhirResource | null>(null);
  const [importText, setImportText] = useState('');
  const [msg, setMsg] = useState('');
  const types = [...new Set(db.resources.map((r) => r.resourceType))].sort();
  const list = db.resources.filter((r) => r.resourceType === type && (!pid || JSON.stringify(r).includes(`Patient/${pid}`) || r.id === pid)).slice(0, 200);
  const v = sel ? validateResource(sel) : null;

  const doImport = (text: string) => {
    try {
      const b = JSON.parse(text) as Bundle | FhirResource;
      const entries: FhirResource[] = b.resourceType === 'Bundle' ? ((b as Bundle).entry ?? []).map((e) => e.resource!).filter(Boolean) : [b as FhirResource];
      const invalid = entries.filter((r) => !validateResource(r).valid);
      if (invalid.length) return setMsg(`${invalid.length} resource(s) failed validation, e.g. ${invalid[0]!.resourceType}: ${validateResource(invalid[0]).issues.find((i) => i.severity === 'error')?.message}`);
      update((d) => entries.forEach((r) => upsertResource(d, r, 'FHIR Bundle import')));
      audit('fhir.import', `Imported FHIR Bundle with ${entries.length} resource(s)`);
      setMsg(`Imported ${entries.length} resource(s).`);
      setImportText('');
    } catch (e) {
      setMsg(`Invalid JSON: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="h1">FHIR viewer</h1>
      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <div className="card space-y-2">
          <label className="label">Resource type</label>
          <select className="input" value={type} onChange={(e) => setType(e.target.value)}>{types.map((t) => <option key={t} value={t}>{t} ({db.resources.filter((r) => r.resourceType === t).length})</option>)}</select>
          <label className="label">Patient</label>
          <select className="input" value={pid} onChange={(e) => setPid(e.target.value)}><option value="">All patients</option>{pts.map((p) => <option key={p.id} value={p.id}>{nameOf(p)}</option>)}</select>
          <div className="max-h-96 overflow-auto rounded-lg border border-line">
            {list.map((r) => <button key={r.id} className={`block w-full truncate px-2 py-1 text-left font-mono text-xs hover:bg-surface-2 ${sel?.id === r.id ? 'bg-accent-soft' : ''}`} onClick={() => setSel(r)}>{r.resourceType}/{r.id}</button>)}
            {!list.length && <p className="muted p-2">No resources.</p>}
          </div>
          {pid && <button className="btn-ghost w-full" onClick={() => downloadJson(`bundle-${pid}.json`, bundleFor(db, pid))}>Download patient Bundle</button>}
        </div>
        <div className="card min-w-0">
          {sel ? (
            <>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm">{sel.resourceType}/{sel.id}</span>
                <span className={`badge ${v?.valid ? 'text-low border-low' : 'text-critical border-critical'}`}>{v?.valid ? 'valid' : 'invalid'} · quality {v?.score}</span>
                <button className="btn-ghost" onClick={() => void copyText(JSON.stringify(sel, null, 2)).then((ok) => setMsg(ok ? 'Copied to clipboard' : 'Copy not permitted'))}>Copy</button>
                <button className="btn-ghost" onClick={() => downloadJson(`${sel.resourceType}-${sel.id}.json`, sel)}>Download</button>
              </div>
              {v && v.issues.length > 0 && <ul className="mb-2 text-xs">{v.issues.map((i, k) => <li key={k} className={i.severity === 'error' ? 'text-critical' : 'text-medium'}>{i.severity}: {i.path} — {i.message}</li>)}</ul>}
              <pre className="max-h-[480px] overflow-auto rounded-lg bg-surface-2 p-3 font-mono text-xs">{JSON.stringify(sel, null, 2)}</pre>
            </>
          ) : <p className="muted">Select a resource to view its JSON.</p>}
        </div>
      </div>
      <div className="card space-y-2">
        <h2 className="h2">Import FHIR Bundle</h2>
        <input type="file" accept=".json,application/json" onChange={async (e) => { const f = e.target.files?.[0]; if (f) doImport(await readFileText(f)); }} />
        <textarea className="input h-28 font-mono text-xs" placeholder='Paste a Bundle: {"resourceType":"Bundle","entry":[...]}' value={importText} onChange={(e) => setImportText(e.target.value)} />
        <div className="flex gap-2"><button className="btn-primary" disabled={!importText} onClick={() => doImport(importText)}>Import pasted JSON</button><a className="btn-ghost" href={`${import.meta.env.BASE_URL}samples/sample-bundle.json`} download>Download sample Bundle</a></div>
        {msg && <p className="text-sm text-fg-muted">{msg}</p>}
      </div>
    </div>
  );
}
