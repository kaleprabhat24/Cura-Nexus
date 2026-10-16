/**
 * Deterministic clinical narrative generators: SBAR handoff, discharge summary and
 * patient-friendly result explanations. They only restate structured facts from the
 * record; an optional LLM may rephrase the output but never adds clinical content.
 */
import { OBS_BY_LOINC } from '@/fhir/codes';

export interface SnapshotVital {
  key: string;
  label: string;
  value: number;
  unit: string;
  date: string;
}

export interface ClinicalSnapshot {
  patientLabel: string; // "Asha Patil, 64 y F, MRN CN-000123"
  age?: number;
  sex?: string;
  location?: string;
  admittedOn?: string;
  reason?: string;
  conditions: string[];
  medications: string[];
  allergies: string[];
  vitals: SnapshotVital[];
  labs: SnapshotVital[];
  news2?: { total: number; risk: string };
  risks: { name: string; tier: string; probability?: number; source: string }[];
  flags: string[];
  pendingTasks: string[];
  imaging: string[];
  followUp?: string;
}

export interface SbarNote {
  situation: string;
  background: string;
  assessment: string;
  recommendation: string;
}

const list = (items: string[], empty = 'none recorded') => (items.length ? items.join(', ') : empty);

export function generateSbar(s: ClinicalSnapshot): SbarNote {
  const vit = s.vitals.map((v) => `${v.label} ${v.value}${v.unit ? ` ${v.unit}` : ''}`).join(', ');
  const situation = `${s.patientLabel}${s.location ? `, ${s.location}` : ''}. ${s.reason ? `Admitted ${s.admittedOn ? `on ${s.admittedOn} ` : ''}with ${s.reason}. ` : ''}${
    s.news2 ? `Current NEWS2 ${s.news2.total} (${s.news2.risk} risk).` : 'No NEWS2 recorded this shift.'
  }`;
  const background = `Problems: ${list(s.conditions)}. Medications: ${list(s.medications)}. Allergies: ${list(s.allergies, 'no known allergies')}.${s.flags.length ? ` Alerts: ${s.flags.join('; ')}.` : ''}`;
  const riskText = s.risks.length ? ` Risk: ${s.risks.map((r) => `${r.name} ${r.tier}${r.probability !== undefined ? ` (${Math.round(r.probability * 100)}%)` : ''}`).join(', ')}.` : '';
  const labText = s.labs.length ? ` Recent results: ${s.labs.slice(0, 6).map((l) => `${l.label} ${l.value} ${l.unit} (${l.date})`).join(', ')}.` : '';
  const assessment = `Latest observations: ${vit || 'not recorded'}.${labText}${riskText}${s.imaging.length ? ` Imaging: ${s.imaging.join('; ')}.` : ''}`;
  const recs: string[] = [];
  if (s.news2) {
    if (s.news2.total >= 7) recs.push('Emergency response: critical-care review now and continuous monitoring');
    else if (s.news2.total >= 5) recs.push('Urgent clinician review within 1 hour; observations at least hourly');
    else if (s.news2.risk === 'low-medium') recs.push('Urgent ward-based review (single parameter scored 3)');
    else recs.push('Continue observations 4–6 hourly; escalate if NEWS2 ≥ 5');
  }
  if (s.risks.some((r) => r.tier.toLowerCase() === 'high')) recs.push('Review high-risk assessments with the responsible consultant');
  if (s.pendingTasks.length) recs.push(`Outstanding: ${s.pendingTasks.join('; ')}`);
  if (s.followUp) recs.push(s.followUp);
  if (s.allergies.length) recs.push(`Check allergies (${s.allergies.join(', ')}) before any new prescription`);
  return { situation, background, assessment, recommendation: recs.length ? `${recs.join('. ')}.` : 'Continue the current plan.' };
}

export function sbarToText(n: SbarNote): string {
  return `S — Situation\n${n.situation}\n\nB — Background\n${n.background}\n\nA — Assessment\n${n.assessment}\n\nR — Recommendation\n${n.recommendation}`;
}

export interface DischargeInput extends ClinicalSnapshot {
  dischargeDate: string;
  diagnosis: string;
  hospitalCourse: string;
  dischargeMeds: string[];
  followUpWith: string;
  followUpInDays: number;
  diet?: string;
  activity?: string;
}

export interface DischargeSummary {
  sections: { title: string; body: string }[];
  redFlags: string[];
}

const RED_FLAGS: Record<string, string[]> = {
  diabet: ['Blood sugar below 70 mg/dL or above 300 mg/dL on repeated checks', 'Vomiting and unable to keep fluids down'],
  hypertens: ['Severe headache, blurred vision or BP above 180/110 mmHg'],
  heart: ['Chest pain, breathlessness at rest or fainting', 'Weight gain of more than 2 kg in 3 days or new ankle swelling'],
  kidney: ['Passing very little urine or new swelling of legs'],
  copd: ['Increasing breathlessness, change in sputum colour or needing the reliever more often'],
  pneumonia: ['Fever returning, breathlessness or confusion'],
  asthma: ['Wheeze not relieved by the reliever inhaler'],
};

export function generateDischarge(d: DischargeInput): DischargeSummary {
  const conds = d.conditions.join(' ').toLowerCase() + ` ${d.diagnosis.toLowerCase()}`;
  const redFlags = ['Any new chest pain, difficulty breathing, confusion or fainting — call 108'];
  for (const [k, flags] of Object.entries(RED_FLAGS)) if (conds.includes(k)) redFlags.push(...flags);
  return {
    sections: [
      { title: 'Patient', body: d.patientLabel },
      { title: 'Admission', body: `${d.admittedOn ?? '—'} → ${d.dischargeDate}${d.location ? ` (${d.location})` : ''}` },
      { title: 'Principal diagnosis', body: d.diagnosis },
      { title: 'Other active problems', body: list(d.conditions.filter((c) => c !== d.diagnosis)) },
      { title: 'Hospital course', body: d.hospitalCourse || 'Uneventful.' },
      { title: 'Key results', body: d.labs.length ? d.labs.slice(0, 8).map((l) => `${l.label}: ${l.value} ${l.unit} (${l.date})`).join('\n') : 'None recorded.' },
      { title: 'Allergies', body: list(d.allergies, 'No known allergies') },
      { title: 'Discharge medications', body: d.dischargeMeds.length ? d.dischargeMeds.map((m) => `• ${m}`).join('\n') : 'No medications.' },
      { title: 'Follow-up', body: `${d.followUpWith} in ${d.followUpInDays} day(s).${d.followUp ? ` ${d.followUp}` : ''}` },
      { title: 'Advice', body: [d.diet ? `Diet: ${d.diet}.` : '', d.activity ? `Activity: ${d.activity}.` : ''].filter(Boolean).join(' ') || 'Resume usual activities as tolerated.' },
    ],
    redFlags: [...new Set(redFlags)],
  };
}

export function dischargeToText(s: DischargeSummary): string {
  return [...s.sections.map((x) => `${x.title.toUpperCase()}\n${x.body}`), `WHEN TO SEEK HELP URGENTLY\n${s.redFlags.map((r) => `• ${r}`).join('\n')}`].join('\n\n');
}

/* ───────────── Plain-language explanations ───────────── */

const EXPLAIN: Record<string, { what: string; goal: string }> = {
  hba1c: { what: 'HbA1c shows your average blood sugar over the last 2–3 months.', goal: 'For most people with diabetes the goal is below 7%.' },
  glucose: { what: 'Fasting glucose is your blood sugar after not eating overnight.', goal: 'A normal fasting value is below 100 mg/dL.' },
  sbp: { what: 'Systolic blood pressure is the top number — the pressure when your heart beats.', goal: 'The usual goal is below 130 mmHg.' },
  dbp: { what: 'Diastolic blood pressure is the bottom number — the pressure between beats.', goal: 'The usual goal is below 80 mmHg.' },
  creatinine: { what: 'Creatinine is a waste product cleared by your kidneys.', goal: 'Higher values can mean the kidneys are working less well.' },
  egfr: { what: 'eGFR estimates how well your kidneys filter blood.', goal: 'Above 90 is normal; below 60 for 3 months suggests kidney disease.' },
  tchol: { what: 'Total cholesterol is the amount of fat-like substance in your blood.', goal: 'Below 200 mg/dL is desirable.' },
  hdl: { what: 'HDL is the "good" cholesterol that protects your heart.', goal: 'Higher is better — above 40 mg/dL (men) or 50 mg/dL (women).' },
  ldl: { what: 'LDL is the "bad" cholesterol that can clog arteries.', goal: 'Below 100 mg/dL for most people, lower if you have heart disease or diabetes.' },
  weight: { what: 'Your body weight.', goal: 'Your care team can help you set a healthy target.' },
  bmi: { what: 'BMI compares your weight with your height.', goal: 'For South Asian adults, 18.5–22.9 is the healthy range.' },
  hr: { what: 'Heart rate is how many times your heart beats in a minute.', goal: 'At rest it is usually 60–100.' },
  spo2: { what: 'Oxygen saturation shows how much oxygen your blood carries.', goal: 'It is usually 95% or more.' },
  temp: { what: 'Body temperature.', goal: 'Normal is about 36.1–37.5 °C.' },
  hb: { what: 'Haemoglobin carries oxygen in your blood; low levels mean anaemia.', goal: 'Usually above 12 g/dL (women) or 13 g/dL (men).' },
  ast: { what: 'AST is a liver enzyme.', goal: 'Raised levels can mean liver stress.' },
  alt: { what: 'ALT is a liver enzyme.', goal: 'Raised levels can mean liver inflammation.' },
  platelets: { what: 'Platelets help your blood clot.', goal: 'Usually 150–410 × 10⁹/L.' },
  uacr: { what: 'Urine albumin/creatinine ratio checks for protein leaking through the kidneys.', goal: 'Below 30 mg/g is normal.' },
  rr: { what: 'Breathing rate per minute.', goal: 'Usually 12–20 at rest.' },
};

export function explainResult(loinc: string, value: number): { title: string; text: string; status: 'normal' | 'high' | 'low' } {
  const def = OBS_BY_LOINC[loinc];
  if (!def) return { title: 'Result', text: `Value ${value}.`, status: 'normal' };
  const e = EXPLAIN[def.key];
  let status: 'normal' | 'high' | 'low' = 'normal';
  if (def.normal) {
    if (value > def.normal[1]) status = 'high';
    else if (value < def.normal[0]) status = 'low';
  }
  const verdict = status === 'normal' ? 'This is within the usual range.' : status === 'high' ? 'This is higher than the usual range.' : 'This is lower than the usual range.';
  return {
    title: `${def.short}: ${value} ${def.unit}`,
    text: `${e?.what ?? ''} ${verdict} ${e?.goal ?? ''}`.trim(),
    status,
  };
}
