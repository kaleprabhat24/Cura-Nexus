import { useState } from 'react';
import { KB } from '@/kb/articles';
import { Bm25Index } from '@/engines/bm25';
import { audit, getDb, initDb, update, useDb, type Role, type Settings as S } from '@/store';
import { downloadText, toCsv } from '@/lib/download';
import { useSession } from '@/app/auth';

const index = new Bm25Index(KB.map((a) => ({ id: a.id, title: a.title, text: a.text })));

export function ruleAnswer(q: string, patient: boolean): string {
  const hits = index.search(q, 2).filter((h) => h.score > 2);
  if (!hits.length) return "I couldn't find that in the built-in knowledge base. Try asking about a condition, medicine or test (e.g. HbA1c, hypertension, CKD, warfarin).";
  return hits.map((h) => { const a = KB.find((k) => k.id === h.doc.id)!; return `**${a.title}** — ${patient ? a.plain : a.text}\n_Source: ${a.source}_`; }).join('\n\n') + '\n\n_General information only — not a diagnosis. Please consult your clinician._';
}

async function llmAnswer(s: S['ai'], q: string): Promise<string> {
  const system = 'You are a cautious clinical information assistant. Answer briefly, add a reminder to consult a clinician.';
  if (s.provider === 'gemini') {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${encodeURIComponent(s.key)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: `${system}\n\n${q}` }] }] }) });
    if (!r.ok) throw new Error(`Gemini ${r.status}`);
    const j = (await r.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    return j.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  }
  const r = await fetch(`${s.baseUrl.replace(/\/+$/, '')}/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(s.key ? { Authorization: `Bearer ${s.key}` } : {}) }, body: JSON.stringify({ model: s.model, messages: [{ role: 'system', content: system }, { role: 'user', content: q }] }) });
  if (!r.ok) throw new Error(`LLM ${r.status}`);
  const j = (await r.json()) as { choices?: { message?: { content?: string } }[] };
  return j.choices?.[0]?.message?.content ?? '';
}

export function Chat() {
  const db = useDb();
  const user = useSession()!;
  const [msgs, setMsgs] = useState<{ role: 'user' | 'bot'; text: string }[]>([{ role: 'bot', text: 'Ask me about conditions, medicines or tests.' }]);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const ai = db.settings.ai;
  const send = async () => {
    if (!q.trim()) return;
    const question = q;
    setQ('');
    setMsgs((m) => [...m, { role: 'user', text: question }]);
    setBusy(true);
    let text = ruleAnswer(question, user.role === 'patient');
    if (ai.provider !== 'none') {
      try {
        const t = await llmAnswer(ai, question);
        if (t) text = `${t}\n\n_(answered by configured LLM)_`;
      } catch (e) {
        text += `\n\n_(LLM unavailable: ${e instanceof Error ? e.message : String(e)} — used the built-in knowledge base)_`;
      }
    }
    setMsgs((m) => [...m, { role: 'bot', text }]);
    setBusy(false);
  };
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="h1">Clinical chat <span className="muted">({ai.provider === 'none' ? 'rule-based knowledge base' : `LLM: ${ai.provider}`})</span></h1>
      <div className="card h-[60vh] space-y-3 overflow-auto">
        {msgs.map((m, i) => <div key={i} className={`max-w-[85%] whitespace-pre-wrap rounded-xl px-3 py-2 text-sm ${m.role === 'user' ? 'ml-auto bg-accent text-accent-fg' : 'bg-surface-2'}`}>{m.text.replace(/\*\*|_/g, '')}</div>)}
        {busy && <div className="muted">Thinking…</div>}
      </div>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void send(); }}>
        <input className="input" placeholder="e.g. What is a good HbA1c target?" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn-primary" disabled={busy}>Send</button>
      </form>
    </div>
  );
}

export function Admin() {
  const db = useDb();
  const [filter, setFilter] = useState('');
  const log = db.audit.filter((a) => `${a.user} ${a.action} ${a.detail}`.toLowerCase().includes(filter.toLowerCase()));
  return (
    <div className="space-y-4">
      <h1 className="h1">Administration</h1>
      <div className="card p-0"><table className="table"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th /></tr></thead><tbody>
        {db.users.map((u) => (
          <tr key={u.id}><td>{u.name}</td><td>{u.email}</td>
            <td><select className="input w-32" value={u.role} onChange={(e) => { update((d) => { d.users.find((x) => x.id === u.id)!.role = e.target.value as Role; }); audit('user.role', `${u.email} role → ${e.target.value}`); }}>{['doctor', 'nurse', 'admin', 'patient'].map((r) => <option key={r}>{r}</option>)}</select></td>
            <td>{u.status}</td>
            <td>{u.status === 'pending' && <button className="btn-primary text-xs" onClick={() => { update((d) => { d.users.find((x) => x.id === u.id)!.status = 'active'; }); audit('user.approve', `Approved ${u.email}`); }}>Approve</button>}</td></tr>
        ))}
      </tbody></table></div>
      <div className="card space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="h2">Audit log ({log.length})</h2><div className="flex gap-2"><input className="input w-56" placeholder="Filter" value={filter} onChange={(e) => setFilter(e.target.value)} /><button className="btn-ghost" onClick={() => downloadText('audit-log.csv', toCsv(log as unknown as Record<string, unknown>[]), 'text/csv')}>Export CSV</button></div></div>
        <div className="max-h-96 overflow-auto"><table className="table"><thead><tr><th>Time</th><th>User</th><th>Action</th><th>Detail</th></tr></thead><tbody>
          {log.map((a) => <tr key={a.id}><td className="whitespace-nowrap tabular-nums text-xs">{a.at.slice(0, 19).replace('T', ' ')}</td><td>{a.user}</td><td className="font-mono text-xs">{a.action}</td><td>{a.detail}</td></tr>)}
        </tbody></table></div>
      </div>
    </div>
  );
}

export function Settings() {
  const db = useDb();
  const user = useSession()!;
  const [ai, setAi] = useState(db.settings.ai);
  const [dbs, setDbs] = useState(db.settings.db);
  const [msg, setMsg] = useState('');
  const saveAi = () => { update((d) => { d.settings.ai = ai; }); audit('settings.ai', `AI provider set to ${ai.provider}`); setMsg('AI provider saved.'); };
  const test = async () => {
    if (dbs.mode === 'local') return setMsg(`Local storage OK — ${(JSON.stringify(getDb()).length / 1024).toFixed(0)} KB used.`);
    setMsg('Testing…');
    try {
      const url = dbs.mode === 'supabase' ? `${dbs.url.replace(/\/+$/, '')}/rest/v1/` : dbs.url;
      const r = await fetch(url, { headers: dbs.key ? { apikey: dbs.key, Authorization: `Bearer ${dbs.key}` } : {} });
      setMsg(r.ok ? `Connected (HTTP ${r.status}).` : `Reached the server but got HTTP ${r.status} — check the key/permissions.`);
    } catch (e) {
      setMsg(`Connection failed: ${e instanceof Error ? e.message : String(e)} (network or CORS).`);
    }
  };
  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="h1">Settings</h1>
      {msg && <div className="card text-sm">{msg}</div>}
      <div className="card space-y-2">
        <h2 className="h2">AI provider (optional)</h2>
        <p className="text-xs text-medium">Keys are stored only in this browser's localStorage. Without a provider the chat uses the built-in knowledge base.</p>
        <select className="input" value={ai.provider} onChange={(e) => setAi({ ...ai, provider: e.target.value as S['ai']['provider'] })}><option value="none">None (rule-based)</option><option value="gemini">Google Gemini</option><option value="openai">OpenAI-compatible (Groq / Ollama / LM Studio)</option></select>
        {ai.provider === 'openai' && <div className="flex flex-wrap gap-2">
          <button className="btn-ghost" onClick={() => setAi({ ...ai, baseUrl: 'https://api.groq.com/openai/v1', model: 'openai/gpt-oss-120b' })}>Groq preset</button>
          <button className="btn-ghost" onClick={() => setAi({ ...ai, baseUrl: 'http://localhost:11434/v1', model: 'llama3.2', key: '' })}>Ollama preset</button>
        </div>}
        {ai.provider === 'openai' && <><input className="input" placeholder="Base URL" value={ai.baseUrl} onChange={(e) => setAi({ ...ai, baseUrl: e.target.value })} /><input className="input" placeholder="Model" value={ai.model} onChange={(e) => setAi({ ...ai, model: e.target.value })} /></>}
        {ai.provider !== 'none' && <input className="input" type="password" placeholder="API key (blank for local Ollama)" value={ai.key} onChange={(e) => setAi({ ...ai, key: e.target.value })} />}
        <button className="btn-primary" onClick={saveAi}>Save AI settings</button>
      </div>
      <div className="card space-y-2">
        <h2 className="h2">Database mode</h2>
        <select className="input" value={dbs.mode} onChange={(e) => setDbs({ ...dbs, mode: e.target.value as S['db']['mode'] })}><option value="local">Local (this browser) — default</option><option value="supabase">Supabase (URL + anon key)</option><option value="rest">PostgreSQL via REST endpoint (PostgREST / Neon Data API)</option></select>
        {dbs.mode !== 'local' && <><input className="input" placeholder={dbs.mode === 'supabase' ? 'https://xyz.supabase.co' : 'https://your-postgrest-endpoint'} value={dbs.url} onChange={(e) => setDbs({ ...dbs, url: e.target.value })} /><input className="input" type="password" placeholder="Key / token" value={dbs.key} onChange={(e) => setDbs({ ...dbs, key: e.target.value })} /><p className="text-xs text-fg-subtle">Browsers cannot open raw PostgreSQL connections, so a REST layer is required. Data continues to be stored locally; this build tests the connection only.</p></>}
        <div className="flex gap-2"><button className="btn-ghost" onClick={() => void test()}>Test connection</button><button className="btn-primary" onClick={() => { update((d) => { d.settings.db = dbs; }); setMsg('Database settings saved.'); }}>Save</button></div>
      </div>
      {user.role === 'admin' || user.role === 'doctor' ? (
        <div className="card space-y-2">
          <h2 className="h2">Demo data</h2>
          <p className="muted">Deletes everything in this browser and re-creates the 30 synthetic patients.</p>
          <button className="btn-danger" onClick={async () => { if (confirm('Reset all demo data?')) { await initDb(true); setMsg('Demo data reset.'); } }}>Reset demo data</button>
        </div>
      ) : null}
    </div>
  );
}
