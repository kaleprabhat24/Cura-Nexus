/**
 * Cura Nexus data store — everything lives in localStorage (key "cura.db"), seeded on first load.
 * Clinical data is kept as FHIR R4 resources; operational data (users, beds, invoices…) as plain rows.
 */
import { useSyncExternalStore } from 'react';
import { createRng } from '@/lib/prng';
import { cc, CONDITIONS, DRUGS, OBS, SYS, conceptForCondition, conceptForDrug } from '@/fhir/codes';
import type { Consent, FhirResource, Observation, Patient } from '@/fhir/types';
import { FEMALE, MALE, SURNAMES, CITIES } from '@/seed-names';

export type Role = 'doctor' | 'nurse' | 'patient' | 'admin';
export interface User { id: string; email: string; name: string; role: Role; salt: string; hash: string; patientId?: string; status: 'active' | 'pending' }
export interface AuditRow { id: string; at: string; user: string; action: string; detail: string }
export interface Appointment { id: string; patientId: string; doctor: string; start: string; reason: string; status: 'booked' | 'cancelled' | 'done' }
export interface Invoice { id: string; patientId: string; date: string; items: { name: string; amount: number }[]; status: 'unpaid' | 'paid' }
export interface Bed { id: string; ward: string; label: string; patientId?: string; status: 'free' | 'occupied' | 'cleaning' }
export interface Settings {
  ai: { provider: 'none' | 'gemini' | 'openai'; key: string; baseUrl: string; model: string };
  db: { mode: 'local' | 'supabase' | 'rest'; url: string; key: string };
}
export interface Db {
  version: number;
  users: User[];
  resources: FhirResource[];
  audit: AuditRow[];
  appointments: Appointment[];
  invoices: Invoice[];
  beds: Bed[];
  settings: Settings;
}

const KEY = 'cura.db';
const VERSION = 1;
let db: Db | null = null;
const listeners = new Set<() => void>();

export const uid = (p: string) => `${p}-${Math.random().toString(36).slice(2, 9)}`;

/** Simple salted SHA-256 (Web Crypto) for demo accounts. */
export async function hashPw(pw: string, salt: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}:${pw}`));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

export function getDb(): Db {
  if (!db) {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Db;
        if (parsed.version === VERSION) db = parsed;
      }
    } catch {
      db = null;
    }
  }
  if (!db) throw new Error('Database not initialised');
  return db;
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(db));
  } catch (e) {
    console.warn('Could not persist database', e);
  }
  listeners.forEach((l) => l());
}

export function update(fn: (d: Db) => void): void {
  const next = structuredClone(getDb());
  fn(next);
  db = next;
  save();
}

export function useDb(): Db {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => getDb(),
  );
}

export function currentUserEmail(): string {
  try {
    return JSON.parse(localStorage.getItem('cura.session') ?? 'null')?.email ?? 'system';
  } catch {
    return 'system';
  }
}

export function audit(action: string, detail: string): void {
  update((d) => {
    d.audit.unshift({ id: uid('a'), at: new Date().toISOString(), user: currentUserEmail(), action, detail });
    d.audit = d.audit.slice(0, 1000);
  });
}

/* ───────── FHIR helpers ───────── */

export const patients = (d: Db) => d.resources.filter((r): r is Patient => r.resourceType === 'Patient');
export const forPatient = (d: Db, pid: string) =>
  d.resources.filter((r) => {
    const o = r as { subject?: { reference?: string }; patient?: { reference?: string } };
    return o.subject?.reference === `Patient/${pid}` || o.patient?.reference === `Patient/${pid}`;
  });

export function nameOf(p?: Patient): string {
  const n = p?.name?.[0];
  return n ? [...(n.given ?? []), n.family].filter(Boolean).join(' ') : 'Unknown';
}
export const phoneOfP = (p?: Patient) => p?.telecom?.find((t) => t.system === 'phone')?.value ?? '';
export const mrnOfP = (p?: Patient) => p?.identifier?.find((i) => i.system === SYS.mrn)?.value ?? '';

export function upsertResource(d: Db, r: FhirResource, source: string): void {
  const now = new Date().toISOString();
  const i = d.resources.findIndex((x) => x.resourceType === r.resourceType && x.id === r.id);
  const v = i >= 0 ? Number(d.resources[i]!.meta?.versionId ?? 1) + 1 : 1;
  const withMeta = { ...r, meta: { ...r.meta, versionId: String(v), lastUpdated: now, source: r.meta?.source ?? source } } as FhirResource;
  if (i >= 0) d.resources[i] = withMeta;
  else d.resources.push(withMeta);
}

export function makeConsent(pid: string, active = true): Consent {
  return {
    resourceType: 'Consent',
    id: `consent-${pid}-${Math.random().toString(36).slice(2, 6)}`,
    status: active ? 'active' : 'inactive',
    scope: cc(SYS.consentScope, 'patient-privacy', 'Privacy Consent'),
    category: [cc(SYS.loinc, '59284-0', 'Patient Consent')],
    patient: { reference: `Patient/${pid}` },
    dateTime: new Date().toISOString(),
    provision: { type: 'permit', purpose: [{ system: SYS.actReason, code: 'TREAT', display: 'Treatment' }], actor: [{ role: cc(SYS.participationType, 'IRCP', 'recipient'), reference: { reference: 'Organization/org-cura', display: 'Cura Nexus care team' } }] },
  };
}

export function obs(pid: string, key: keyof typeof OBS, value: number, when: string, source = 'Cura Nexus'): Observation {
  const o = OBS[key]!;
  return {
    resourceType: 'Observation',
    id: uid('obs'),
    meta: { source },
    status: 'final',
    category: [cc(SYS.obsCategory, o.category, o.category)],
    code: cc(SYS.loinc, o.code, o.display, o.short),
    subject: { reference: `Patient/${pid}` },
    effectiveDateTime: when,
    valueQuantity: { value, unit: o.unit, system: SYS.ucum, code: o.ucum },
  };
}

/* ───────── seed ───────── */

export async function initDb(force = false): Promise<void> {
  if (!force) {
    try {
      getDb();
      return;
    } catch {
      /* seed below */
    }
  }
  const rng = createRng(20241017);
  const now = Date.now();
  const resources: FhirResource[] = [];
  const day = 86_400_000;
  for (let i = 1; i <= 30; i++) {
    const male = rng.chance(0.5);
    const region = rng.pick(['west', 'north', 'south', 'east'] as const);
    const city = rng.pick(CITIES.filter((c) => c.region === region));
    const given = i === 1 ? 'Asha' : rng.pick((male ? MALE : FEMALE).hindu);
    const family = i === 1 ? 'Patil' : rng.pick(SURNAMES[region]);
    const pid = `pt-${String(i).padStart(3, '0')}`;
    const age = rng.int(28, 82);
    const p: Patient = {
      resourceType: 'Patient',
      id: pid,
      meta: { source: 'Cura Nexus' },
      identifier: [{ system: SYS.mrn, value: `CN-${String(i).padStart(6, '0')}` }, ...(rng.chance(0.6) ? [{ system: SYS.abha, value: `91${rng.int(100000000000, 999999999999)}` }] : [])],
      active: true,
      name: [{ use: 'official', family, given: [given] }],
      gender: i === 1 ? 'female' : male ? 'male' : 'female',
      birthDate: new Date(now - age * 365.25 * day).toISOString().slice(0, 10),
      telecom: [{ system: 'phone', value: `+91 9${rng.int(1000, 9999)} ${rng.int(10000, 99999)}` }],
      address: [{ city: city.city, state: city.state, country: 'IN' }],
    };
    resources.push(p, makeConsent(pid));
    const conds = rng.sample(CONDITIONS.filter((c) => c.chronic), rng.int(1, 3));
    if (i === 1) conds.splice(0, conds.length, CONDITIONS[0]!, CONDITIONS[1]!);
    for (const c of conds) resources.push({ resourceType: 'Condition', id: uid('cond'), meta: { source: 'Cura Nexus' }, clinicalStatus: cc(SYS.condClinical, 'active', 'Active'), code: conceptForCondition(c), subject: { reference: `Patient/${pid}` }, onsetDateTime: new Date(now - rng.int(300, 2000) * day).toISOString().slice(0, 10) });
    for (const d of rng.sample(DRUGS.slice(0, 16), rng.int(1, 3))) resources.push({ resourceType: 'MedicationRequest', id: uid('med'), meta: { source: 'Cura Nexus' }, status: 'active', intent: 'order', medicationCodeableConcept: conceptForDrug(d), subject: { reference: `Patient/${pid}` }, authoredOn: new Date(now - rng.int(30, 700) * day).toISOString().slice(0, 10), dosageInstruction: [{ text: d.defaultDose }] });
    const diabetic = conds.some((c) => c.key === 't2dm');
    const sbp0 = rng.int(118, 150);
    for (let v = 0; v < 6; v++) {
      const when = new Date(now - (6 - v) * 60 * day).toISOString();
      resources.push(obs(pid, 'sbp', sbp0 + rng.int(-8, 10), when), obs(pid, 'dbp', Math.round(sbp0 * 0.62) + rng.int(-5, 5), when), obs(pid, 'hr', rng.int(64, 96), when));
      if (v % 2 === 0) resources.push(obs(pid, 'hba1c', Math.round((diabetic ? rng.float(6.8, 9.2) : rng.float(5, 5.8)) * 10) / 10, when));
    }
  }
  const users: User[] = [];
  for (const [email, name, role, patientId] of [
    ['doctor@cura.ai', 'Dr Ananya Iyer', 'doctor', undefined],
    ['nurse@cura.ai', 'Grace Thomas', 'nurse', undefined],
    ['admin@cura.ai', 'Sanjay Gupta', 'admin', undefined],
    ['patient@cura.ai', 'Asha Patil', 'patient', 'pt-001'],
  ] as const) {
    const salt = Math.random().toString(36).slice(2);
    users.push({ id: uid('u'), email, name, role, salt, hash: await hashPw('Demo@123', salt), patientId, status: 'active' });
  }
  const beds: Bed[] = [];
  ['ICU', 'General Medicine', 'Surgical'].forEach((ward, w) => {
    for (let b = 1; b <= 8; b++) beds.push({ id: `bed-${w}-${b}`, ward, label: `${ward.slice(0, 3).toUpperCase()}-${b}`, status: b <= 5 ? 'occupied' : b === 6 ? 'cleaning' : 'free', patientId: b <= 5 ? `pt-${String(w * 5 + b + 1).padStart(3, '0')}` : undefined });
  });
  db = {
    version: VERSION,
    users,
    resources,
    audit: [{ id: uid('a'), at: new Date().toISOString(), user: 'system', action: 'seed', detail: 'Demo data created (30 synthetic patients)' }],
    appointments: Array.from({ length: 8 }, (_, k) => ({ id: uid('ap'), patientId: `pt-${String(k + 1).padStart(3, '0')}`, doctor: 'Dr Ananya Iyer', start: new Date(now + (k + 1) * day / 2).toISOString().slice(0, 16), reason: 'Follow-up', status: 'booked' as const })),
    invoices: Array.from({ length: 6 }, (_, k) => ({ id: `INV-${1000 + k}`, patientId: `pt-${String(k + 1).padStart(3, '0')}`, date: new Date(now - k * day).toISOString().slice(0, 10), items: [{ name: 'OPD consultation', amount: 800 }, { name: 'HbA1c', amount: 550 }], status: k % 2 ? 'paid' as const : 'unpaid' as const })),
    beds,
    settings: { ai: { provider: 'none', key: '', baseUrl: 'https://api.groq.com/openai/v1', model: 'openai/gpt-oss-120b' }, db: { mode: 'local', url: '', key: '' } },
  };
  save();
}
