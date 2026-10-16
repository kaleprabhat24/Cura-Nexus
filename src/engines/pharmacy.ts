/**
 * Medication safety: drug–drug interactions, allergy cross-reactivity and CPIC
 * pharmacogenomic rules. Embedded rule tables — a teaching subset, not a full compendium.
 */
import { ALLERGEN_BY_KEY, DRUG_BY_KEY, type DrugCode } from '@/fhir/codes';

export type Severity = 'contraindicated' | 'major' | 'moderate' | 'minor';

export interface InteractionRule {
  a: string; // drug key or "class:<name>"
  b: string;
  severity: Severity;
  effect: string;
  management: string;
}

export const INTERACTIONS: InteractionRule[] = [
  { a: 'class:vka', b: 'class:nsaid', severity: 'major', effect: 'Increased bleeding risk (additive antihaemostatic effect, GI mucosal injury).', management: 'Avoid NSAIDs; use paracetamol. If unavoidable add a PPI and monitor INR.' },
  { a: 'class:vka', b: 'class:antiplatelet', severity: 'major', effect: 'Increased bleeding risk with combined anticoagulant and antiplatelet therapy.', management: 'Only when there is a clear indication; minimise duration; monitor for bleeding.' },
  { a: 'class:vka', b: 'class:azole', severity: 'major', effect: 'CYP2C9 inhibition raises warfarin levels — INR may double.', management: 'Reduce warfarin dose empirically and check INR within 3–5 days.' },
  { a: 'warfarin', b: 'amiodarone', severity: 'major', effect: 'Amiodarone inhibits warfarin metabolism (CYP2C9/3A4); INR rises over weeks.', management: 'Reduce warfarin dose by 30–50% and monitor INR weekly.' },
  { a: 'clopidogrel', b: 'omeprazole', severity: 'moderate', effect: 'Omeprazole inhibits CYP2C19, reducing activation of clopidogrel.', management: 'Prefer pantoprazole if a PPI is needed.' },
  { a: 'simvastatin', b: 'class:cyp3a4_inhibitor', severity: 'contraindicated', effect: 'Markedly increased simvastatin exposure — myopathy and rhabdomyolysis.', management: 'Do not combine; suspend simvastatin or use a non-interacting statin.' },
  { a: 'simvastatin', b: 'amiodarone', severity: 'major', effect: 'Increased risk of myopathy.', management: 'Do not exceed simvastatin 20 mg daily.' },
  { a: 'class:serotonergic', b: 'tramadol', severity: 'major', effect: 'Serotonin syndrome and lowered seizure threshold.', management: 'Avoid; choose a non-serotonergic analgesic.' },
  { a: 'class:ssri', b: 'class:nsaid', severity: 'moderate', effect: 'Increased risk of upper GI bleeding.', management: 'Consider gastroprotection or avoid the NSAID.' },
  { a: 'class:acei', b: 'class:k_sparing', severity: 'major', effect: 'Hyperkalaemia.', management: 'Monitor potassium and renal function within 1 week.' },
  { a: 'class:arb', b: 'class:k_sparing', severity: 'major', effect: 'Hyperkalaemia.', management: 'Monitor potassium and renal function within 1 week.' },
  { a: 'class:acei', b: 'class:potassium', severity: 'major', effect: 'Hyperkalaemia.', management: 'Avoid routine potassium supplements; monitor potassium.' },
  { a: 'class:arb', b: 'class:potassium', severity: 'major', effect: 'Hyperkalaemia.', management: 'Avoid routine potassium supplements; monitor potassium.' },
  { a: 'class:acei', b: 'class:arb', severity: 'major', effect: 'Dual RAAS blockade — hyperkalaemia, hypotension, acute kidney injury.', management: 'Avoid the combination.' },
  { a: 'class:nsaid', b: 'class:acei', severity: 'moderate', effect: 'Reduced antihypertensive effect and risk of acute kidney injury (worse with a diuretic).', management: 'Avoid in CKD; monitor creatinine and BP.' },
  { a: 'class:nsaid', b: 'class:arb', severity: 'moderate', effect: 'Reduced antihypertensive effect and risk of acute kidney injury (worse with a diuretic).', management: 'Avoid in CKD; monitor creatinine and BP.' },
  { a: 'digoxin', b: 'amiodarone', severity: 'major', effect: 'Amiodarone raises digoxin levels — toxicity (bradycardia, arrhythmia).', management: 'Halve the digoxin dose and monitor levels.' },
  { a: 'digoxin', b: 'class:macrolide', severity: 'moderate', effect: 'Macrolides increase digoxin absorption/levels.', management: 'Monitor for digoxin toxicity.' },
  { a: 'class:pde5', b: 'class:nitrate', severity: 'contraindicated', effect: 'Profound, potentially fatal hypotension.', management: 'Never co-prescribe; separate by ≥ 24 h (sildenafil).' },
  { a: 'class:fluoroquinolone', b: 'class:corticosteroid', severity: 'moderate', effect: 'Increased risk of tendinopathy and tendon rupture.', management: 'Counsel the patient; avoid in older adults where possible.' },
  { a: 'azithromycin', b: 'amiodarone', severity: 'major', effect: 'Additive QT prolongation — torsades de pointes.', management: 'Avoid; if essential, obtain baseline ECG and electrolytes.' },
  { a: 'class:sulfonylurea', b: 'class:azole', severity: 'moderate', effect: 'CYP2C9 inhibition increases sulfonylurea levels — hypoglycaemia.', management: 'Monitor glucose; consider a dose reduction.' },
  { a: 'class:loop_diuretic', b: 'digoxin', severity: 'moderate', effect: 'Diuretic-induced hypokalaemia potentiates digoxin toxicity.', management: 'Monitor potassium.' },
  { a: 'metformin', b: 'class:loop_diuretic', severity: 'minor', effect: 'Possible increase in metformin levels; dehydration raises lactic acidosis risk.', management: 'Monitor renal function.' },
];

export interface InteractionHit {
  drugA: DrugCode;
  drugB: DrugCode;
  rule: InteractionRule;
}

function matchesSpec(drug: DrugCode, spec: string): boolean {
  return spec.startsWith('class:') ? drug.classes.includes(spec.slice(6)) : drug.key === spec;
}

export function checkInteractions(drugKeys: string[]): InteractionHit[] {
  const drugs = [...new Set(drugKeys)].map((k) => DRUG_BY_KEY[k]).filter((d): d is DrugCode => !!d);
  const hits: InteractionHit[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < drugs.length; i++) {
    for (let j = i + 1; j < drugs.length; j++) {
      const a = drugs[i]!;
      const b = drugs[j]!;
      for (const rule of INTERACTIONS) {
        const forward = matchesSpec(a, rule.a) && matchesSpec(b, rule.b);
        const reverse = matchesSpec(b, rule.a) && matchesSpec(a, rule.b);
        if (!forward && !reverse) continue;
        const key = `${[a.key, b.key].sort().join('+')}|${rule.effect}`;
        if (seen.has(key)) continue;
        seen.add(key);
        hits.push({ drugA: a, drugB: b, rule });
      }
    }
  }
  return hits.sort((x, y) => SEVERITY_RANK[x.rule.severity] - SEVERITY_RANK[y.rule.severity]);
}

export const SEVERITY_RANK: Record<Severity, number> = { contraindicated: 0, major: 1, moderate: 2, minor: 3 };

export interface AllergyHit {
  drug: DrugCode;
  allergen: string;
  severity: Severity;
  message: string;
}

export function checkAllergies(drugKeys: string[], allergenKeys: string[]): AllergyHit[] {
  const hits: AllergyHit[] = [];
  for (const dk of drugKeys) {
    const drug = DRUG_BY_KEY[dk];
    if (!drug) continue;
    for (const ak of allergenKeys) {
      const allergen = ALLERGEN_BY_KEY[ak];
      if (!allergen) continue;
      if (allergen.crossClasses.some((c) => drug.classes.includes(c))) {
        hits.push({ drug, allergen: allergen.display, severity: 'contraindicated', message: `${drug.name} belongs to a class the patient is allergic to (${allergen.display}).` });
      } else if (ak === 'penicillin' && drug.classes.includes('cephalosporin')) {
        hits.push({
          drug,
          allergen: allergen.display,
          severity: 'moderate',
          message: `Penicillin allergy: low (~1–2%) cross-reactivity with ${drug.name}. Avoid if the penicillin reaction was anaphylaxis.`,
        });
      }
    }
  }
  return hits;
}

/* ───────────── CPIC pharmacogenomics ───────────── */

export type Phenotype =
  | 'Ultrarapid metabolizer'
  | 'Rapid metabolizer'
  | 'Normal metabolizer'
  | 'Intermediate metabolizer'
  | 'Poor metabolizer'
  | 'Normal function'
  | 'Decreased function'
  | 'Poor function';

export interface PgxProfile {
  CYP2C19?: Phenotype;
  CYP2D6?: Phenotype;
  CYP2C9?: '*1/*1' | '*1/*2' | '*1/*3' | '*2/*2' | '*2/*3' | '*3/*3';
  VKORC1?: 'GG' | 'AG' | 'AA';
  SLCO1B1?: 'Normal function' | 'Decreased function' | 'Poor function';
  DPYD?: 'Normal metabolizer' | 'Intermediate metabolizer' | 'Poor metabolizer';
}

export interface PgxRecommendation {
  drug: DrugCode;
  gene: string;
  phenotype: string;
  severity: Severity;
  recommendation: string;
  source: string;
}

// Expected maintenance warfarin dose ranges (mg/day) by VKORC1 −1639G>A × CYP2C9 genotype
// (FDA warfarin label, Table 5; consistent with CPIC 2017 guidance).
const WARFARIN_TABLE: Record<string, Record<string, string>> = {
  GG: { '*1/*1': '5–7', '*1/*2': '5–7', '*1/*3': '3–4', '*2/*2': '3–4', '*2/*3': '3–4', '*3/*3': '0.5–2' },
  AG: { '*1/*1': '5–7', '*1/*2': '3–4', '*1/*3': '3–4', '*2/*2': '3–4', '*2/*3': '0.5–2', '*3/*3': '0.5–2' },
  AA: { '*1/*1': '3–4', '*1/*2': '3–4', '*1/*3': '0.5–2', '*2/*2': '0.5–2', '*2/*3': '0.5–2', '*3/*3': '0.5–2' },
};

export function checkPgx(drugKeys: string[], pgx: PgxProfile): PgxRecommendation[] {
  const out: PgxRecommendation[] = [];
  for (const key of drugKeys) {
    const drug = DRUG_BY_KEY[key];
    if (!drug) continue;
    if (key === 'clopidogrel' && pgx.CYP2C19 && ['Intermediate metabolizer', 'Poor metabolizer'].includes(pgx.CYP2C19)) {
      out.push({
        drug,
        gene: 'CYP2C19',
        phenotype: pgx.CYP2C19,
        severity: pgx.CYP2C19 === 'Poor metabolizer' ? 'major' : 'moderate',
        recommendation: 'Reduced formation of the active metabolite. Avoid clopidogrel; use prasugrel or ticagrelor if not contraindicated.',
        source: 'CPIC guideline for CYP2C19 and clopidogrel (2022 update)',
      });
    }
    if (key === 'warfarin' && pgx.CYP2C9 && pgx.VKORC1) {
      const range = WARFARIN_TABLE[pgx.VKORC1]?.[pgx.CYP2C9];
      if (range) {
        const reduced = range !== '5–7';
        out.push({
          drug,
          gene: 'CYP2C9 + VKORC1',
          phenotype: `CYP2C9 ${pgx.CYP2C9}, VKORC1 ${pgx.VKORC1}`,
          severity: range === '0.5–2' ? 'major' : reduced ? 'moderate' : 'minor',
          recommendation: `Expected maintenance dose ${range} mg/day. ${reduced ? 'Start lower than the standard 5 mg and titrate to INR.' : 'Standard dosing; titrate to INR.'}`,
          source: 'CPIC guideline for CYP2C9, VKORC1 and warfarin (2017); FDA warfarin label',
        });
      }
    }
    if (drug.classes.includes('statin') && pgx.SLCO1B1 && pgx.SLCO1B1 !== 'Normal function') {
      const poor = pgx.SLCO1B1 === 'Poor function';
      const rec =
        key === 'simvastatin'
          ? poor
            ? 'Avoid simvastatin — high myopathy risk. Prefer rosuvastatin or pravastatin.'
            : 'Prescribe ≤ 20 mg/day simvastatin or choose an alternative statin.'
          : poor
            ? `Prescribe ${drug.name} at ≤ 20 mg/day (or ≤ 10 mg rosuvastatin); monitor for myopathy.`
            : `Standard ${drug.name} dosing is acceptable; consider dose ceiling and monitor.`;
      out.push({
        drug,
        gene: 'SLCO1B1',
        phenotype: pgx.SLCO1B1,
        severity: key === 'simvastatin' && poor ? 'major' : 'moderate',
        recommendation: rec,
        source: 'CPIC guideline for SLCO1B1, ABCG2, CYP2C9 and statins (2022)',
      });
    }
    if (drug.classes.includes('fluoropyrimidine') && pgx.DPYD && pgx.DPYD !== 'Normal metabolizer') {
      const poor = pgx.DPYD === 'Poor metabolizer';
      out.push({
        drug,
        gene: 'DPYD',
        phenotype: pgx.DPYD,
        severity: poor ? 'contraindicated' : 'major',
        recommendation: poor
          ? 'Avoid fluoropyrimidines — risk of severe or fatal toxicity.'
          : 'Reduce the starting dose by 50% and titrate based on toxicity.',
        source: 'CPIC guideline for DPYD and fluoropyrimidines (2017, 2024 update)',
      });
    }
    if ((key === 'codeine' || key === 'tramadol') && pgx.CYP2D6 && ['Ultrarapid metabolizer', 'Poor metabolizer'].includes(pgx.CYP2D6)) {
      const ultra = pgx.CYP2D6 === 'Ultrarapid metabolizer';
      out.push({
        drug,
        gene: 'CYP2D6',
        phenotype: pgx.CYP2D6,
        severity: ultra ? 'contraindicated' : 'major',
        recommendation: ultra
          ? `Avoid ${drug.name} — increased formation of active opioid metabolite and risk of toxicity. Use a non-CYP2D6 analgesic.`
          : `Avoid ${drug.name} — lack of efficacy. Use a non-CYP2D6-dependent analgesic.`,
        source: 'CPIC guideline for CYP2D6, OPRM1, COMT and opioids (2021)',
      });
    }
  }
  return out;
}

export interface SafetyReport {
  interactions: InteractionHit[];
  allergies: AllergyHit[];
  pgx: PgxRecommendation[];
  highest: Severity | 'none';
}

export function safetyCheck(drugKeys: string[], allergenKeys: string[], pgx: PgxProfile): SafetyReport {
  const interactions = checkInteractions(drugKeys);
  const allergies = checkAllergies(drugKeys, allergenKeys);
  const pgxRecs = checkPgx(drugKeys, pgx);
  const all = [...interactions.map((i) => i.rule.severity), ...allergies.map((a) => a.severity), ...pgxRecs.map((p) => p.severity)];
  const highest = all.length ? all.sort((a, b) => SEVERITY_RANK[a] - SEVERITY_RANK[b])[0]! : 'none';
  return { interactions, allergies, pgx: pgxRecs, highest };
}
