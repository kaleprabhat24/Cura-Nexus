/**
 * In-browser medallion pipeline over the FHIR store.
 *
 * Bronze  — every Observation flattened to one raw row per measured value (append-only).
 * Gates   — declarative expectations; failing rows go to quarantine with the rule name.
 * Silver  — passing rows with units normalised to canonical UCUM units and exact
 *           duplicates removed.
 * Gold    — one feature row per patient (latest values, control status, CKD stage, eGFR
 *           slope) plus cohort KPIs. Research marts include only research-consented patients.
 */
import { OBS, OBS_BY_LOINC, SYS } from '@/fhir/codes';
import type { Observation } from '@/fhir/types';
import { ckdStage } from './calculators';

export interface BronzeRow {
  rowId: string;
  observationId: string;
  patientId?: string;
  loinc?: string;
  system?: string;
  display?: string;
  value?: number;
  unit?: string;
  effective?: string;
  source: string;
}

export interface SilverRow {
  rowId: string;
  patientId: string;
  key: string; // OBS key, e.g. "hba1c"
  loinc: string;
  value: number;
  unit: string;
  effective: string;
  source: string;
  converted?: string;
}

export interface QuarantineRow extends BronzeRow {
  rule: string;
  message: string;
}

export interface Expectation {
  name: string;
  description: string;
  check: (r: BronzeRow, ctx: { patientIds: Set<string>; now: number }) => string | null;
}

/** Unit conversions to the canonical unit of each code. */
const CONVERSIONS: Record<string, Record<string, (v: number) => number>> = {
  [OBS.glucose.code]: { 'mmol/L': (v) => v * 18.016 },
  [OBS.creatinine.code]: { 'umol/L': (v) => v / 88.42, 'µmol/L': (v) => v / 88.42 },
  [OBS.temp.code]: { '[degF]': (v) => ((v - 32) * 5) / 9, '°F': (v) => ((v - 32) * 5) / 9 },
  [OBS.tchol.code]: { 'mmol/L': (v) => v * 38.67 },
  [OBS.hdl.code]: { 'mmol/L': (v) => v * 38.67 },
  [OBS.ldl.code]: { 'mmol/L': (v) => v * 38.67 },
  [OBS.weight.code]: { '[lb_av]': (v) => v * 0.453592, lb: (v) => v * 0.453592 },
};

export function canonicalise(loinc: string, value: number, unit: string | undefined): { value: number; unit: string; converted?: string } | null {
  const def = OBS_BY_LOINC[loinc];
  if (!def) return null;
  if (!unit || unit === def.unit || unit === def.ucum) return { value, unit: def.unit };
  const conv = CONVERSIONS[loinc]?.[unit];
  if (!conv) return null;
  return { value: conv(value), unit: def.unit, converted: `${unit} → ${def.unit}` };
}

export const EXPECTATIONS: Expectation[] = [
  { name: 'patient_not_null', description: 'Row must reference a patient', check: (r) => (r.patientId ? null : 'Missing patient reference') },
  {
    name: 'patient_exists',
    description: 'Referenced patient must exist in the MPI',
    check: (r, ctx) => (r.patientId && !ctx.patientIds.has(r.patientId) ? `Patient/${r.patientId} not found` : null),
  },
  { name: 'code_is_loinc', description: 'Code must be LOINC', check: (r) => (r.system === SYS.loinc ? null : `Code system ${r.system ?? 'missing'} is not LOINC`) },
  { name: 'code_in_catalogue', description: 'LOINC code must be in the measurement catalogue', check: (r) => (r.loinc && OBS_BY_LOINC[r.loinc] ? null : `LOINC ${r.loinc} not in catalogue`) },
  { name: 'value_numeric', description: 'Value must be a finite number', check: (r) => (typeof r.value === 'number' && Number.isFinite(r.value) ? null : 'Value is not numeric') },
  {
    name: 'unit_convertible',
    description: 'Unit must be canonical or convertible',
    check: (r) => (r.loinc && typeof r.value === 'number' && canonicalise(r.loinc, r.value, r.unit) === null ? `Unit "${r.unit ?? '∅'}" not convertible` : null),
  },
  {
    name: 'value_plausible',
    description: 'Value (after unit conversion) must be physiologically plausible',
    check: (r) => {
      if (!r.loinc || typeof r.value !== 'number') return null;
      const c = canonicalise(r.loinc, r.value, r.unit);
      const def = OBS_BY_LOINC[r.loinc];
      if (!c || !def) return null;
      return c.value < def.plausible[0] || c.value > def.plausible[1] ? `${c.value.toFixed(1)} ${def.unit} outside ${def.plausible[0]}–${def.plausible[1]}` : null;
    },
  },
  {
    name: 'effective_valid',
    description: 'Effective time present and not in the future',
    check: (r, ctx) => {
      if (!r.effective) return 'Missing effective time';
      const t = new Date(r.effective).getTime();
      if (Number.isNaN(t)) return 'Unparseable effective time';
      return t > ctx.now + 86_400_000 ? 'Effective time is in the future' : null;
    },
  },
];

export function toBronze(observations: { resource: Observation; source: string }[]): BronzeRow[] {
  const rows: BronzeRow[] = [];
  for (const { resource: o, source } of observations) {
    const pid = o.subject?.reference?.startsWith('Patient/') ? o.subject.reference.slice(8) : undefined;
    const base = { observationId: o.id!, patientId: pid, effective: o.effectiveDateTime, source };
    const coding = o.code.coding?.[0];
    if (o.component?.length) {
      o.component.forEach((c, i) => {
        const cc = c.code.coding?.[0];
        rows.push({ ...base, rowId: `${o.id}#${i}`, loinc: cc?.code, system: cc?.system, display: cc?.display, value: c.valueQuantity?.value, unit: c.valueQuantity?.unit });
      });
    } else if (o.valueQuantity) {
      rows.push({ ...base, rowId: o.id!, loinc: coding?.code, system: coding?.system, display: coding?.display, value: o.valueQuantity.value, unit: o.valueQuantity.unit });
    }
  }
  return rows;
}

export interface GateResult {
  name: string;
  description: string;
  passed: number;
  failed: number;
}

export interface PatientFeatures {
  patientId: string;
  latest: Record<string, { value: number; date: string }>;
  measurements: number;
  bpControlled?: boolean;
  a1cControlled?: boolean;
  ckdStage?: string;
  egfrSlope?: number; // mL/min/1.73m² per year
  researchConsent: boolean;
}

export interface PipelineResult {
  bronze: number;
  silver: SilverRow[];
  quarantine: QuarantineRow[];
  duplicatesRemoved: number;
  conversions: number;
  gates: GateResult[];
  gold: PatientFeatures[];
  kpis: {
    patients: number;
    researchCohort: number;
    diabetics: number;
    a1cControlledPct: number | null;
    hypertensives: number;
    bpControlledPct: number | null;
    ckdG3plus: number;
    passRate: number;
  };
  durationsMs: { bronze: number; silver: number; gold: number };
}

function slope(points: { t: number; v: number }[]): number | undefined {
  if (points.length < 2) return undefined;
  const n = points.length;
  const mt = points.reduce((s, p) => s + p.t, 0) / n;
  const mv = points.reduce((s, p) => s + p.v, 0) / n;
  const num = points.reduce((s, p) => s + (p.t - mt) * (p.v - mv), 0);
  const den = points.reduce((s, p) => s + (p.t - mt) ** 2, 0);
  return den ? num / den : undefined;
}

export function runPipeline(input: {
  observations: { resource: Observation; source: string }[];
  patientIds: string[];
  diabetics: Set<string>;
  hypertensives: Set<string>;
  researchConsented: Set<string>;
  now?: number;
}): PipelineResult {
  const t0 = performance.now();
  const bronze = toBronze(input.observations);
  const t1 = performance.now();
  const ctx = { patientIds: new Set(input.patientIds), now: input.now ?? Date.now() };
  const gates: GateResult[] = EXPECTATIONS.map((e) => ({ name: e.name, description: e.description, passed: 0, failed: 0 }));
  const quarantine: QuarantineRow[] = [];
  const passing: BronzeRow[] = [];
  for (const row of bronze) {
    let failed = false;
    EXPECTATIONS.forEach((e, i) => {
      if (failed) return;
      const msg = e.check(row, ctx);
      if (msg) {
        gates[i]!.failed++;
        quarantine.push({ ...row, rule: e.name, message: msg });
        failed = true;
      } else gates[i]!.passed++;
    });
    if (!failed) passing.push(row);
  }
  const seen = new Set<string>();
  const silver: SilverRow[] = [];
  let duplicates = 0;
  let conversions = 0;
  for (const r of passing) {
    const c = canonicalise(r.loinc!, r.value!, r.unit)!;
    const def = OBS_BY_LOINC[r.loinc!]!;
    const dedupKey = `${r.patientId}|${r.loinc}|${r.effective}|${c.value.toFixed(3)}`;
    if (seen.has(dedupKey)) {
      duplicates++;
      continue;
    }
    seen.add(dedupKey);
    if (c.converted) conversions++;
    silver.push({ rowId: r.rowId, patientId: r.patientId!, key: def.key, loinc: r.loinc!, value: Math.round(c.value * 100) / 100, unit: c.unit, effective: r.effective!, source: r.source, converted: c.converted });
  }
  const t2 = performance.now();

  const byPatient = new Map<string, SilverRow[]>();
  for (const r of silver) {
    const arr = byPatient.get(r.patientId) ?? [];
    arr.push(r);
    byPatient.set(r.patientId, arr);
  }
  const gold: PatientFeatures[] = [];
  for (const pid of input.patientIds) {
    const rows = (byPatient.get(pid) ?? []).sort((a, b) => b.effective.localeCompare(a.effective));
    const latest: PatientFeatures['latest'] = {};
    for (const r of rows) if (!latest[r.key]) latest[r.key] = { value: r.value, date: r.effective.slice(0, 10) };
    const egfrPts = rows.filter((r) => r.key === 'egfr').map((r) => ({ t: new Date(r.effective).getTime() / (365.25 * 86_400_000), v: r.value }));
    const s = slope(egfrPts);
    gold.push({
      patientId: pid,
      latest,
      measurements: rows.length,
      bpControlled: latest.sbp && latest.dbp ? latest.sbp.value < 140 && latest.dbp.value < 90 : undefined,
      a1cControlled: latest.hba1c ? latest.hba1c.value < 7 : undefined,
      ckdStage: latest.egfr ? ckdStage(latest.egfr.value).stage : undefined,
      egfrSlope: s !== undefined ? Math.round(s * 10) / 10 : undefined,
      researchConsent: input.researchConsented.has(pid),
    });
  }
  const dm = gold.filter((g) => input.diabetics.has(g.patientId) && g.a1cControlled !== undefined);
  const htn = gold.filter((g) => input.hypertensives.has(g.patientId) && g.bpControlled !== undefined);
  const t3 = performance.now();
  return {
    bronze: bronze.length,
    silver,
    quarantine,
    duplicatesRemoved: duplicates,
    conversions,
    gates,
    gold,
    kpis: {
      patients: gold.length,
      researchCohort: gold.filter((g) => g.researchConsent).length,
      diabetics: dm.length,
      a1cControlledPct: dm.length ? dm.filter((g) => g.a1cControlled).length / dm.length : null,
      hypertensives: htn.length,
      bpControlledPct: htn.length ? htn.filter((g) => g.bpControlled).length / htn.length : null,
      ckdG3plus: gold.filter((g) => g.ckdStage && ['G3a', 'G3b', 'G4', 'G5'].includes(g.ckdStage)).length,
      passRate: bronze.length ? passing.length / bronze.length : 1,
    },
    durationsMs: { bronze: Math.round(t1 - t0), silver: Math.round(t2 - t1), gold: Math.round(t3 - t2) },
  };
}
