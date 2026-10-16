/**
 * Validated clinical calculators. Each function is pure and documented with its source.
 */

export type Sex = 'male' | 'female';

/* ───────────── eGFR — CKD-EPI 2021 (race-free) ─────────────
 * Inker LA et al. N Engl J Med 2021;385:1737-49.
 * eGFR = 142 × min(Scr/κ, 1)^α × max(Scr/κ, 1)^−1.200 × 0.9938^age × 1.012 [if female]
 * κ = 0.7 (F) / 0.9 (M); α = −0.241 (F) / −0.302 (M); Scr in mg/dL. */
export function egfrCkdEpi2021(creatinineMgDl: number, age: number, sex: Sex): number {
  if (creatinineMgDl <= 0 || age < 18) throw new RangeError('CKD-EPI 2021 requires creatinine > 0 and age ≥ 18');
  const female = sex === 'female';
  const k = female ? 0.7 : 0.9;
  const a = female ? -0.241 : -0.302;
  const r = creatinineMgDl / k;
  return 142 * Math.min(r, 1) ** a * Math.max(r, 1) ** -1.2 * 0.9938 ** age * (female ? 1.012 : 1);
}

export function ckdStage(egfr: number): { stage: string; label: string; severity: 'low' | 'medium' | 'high' | 'critical' } {
  if (egfr >= 90) return { stage: 'G1', label: 'Normal or high', severity: 'low' };
  if (egfr >= 60) return { stage: 'G2', label: 'Mildly decreased', severity: 'low' };
  if (egfr >= 45) return { stage: 'G3a', label: 'Mildly to moderately decreased', severity: 'medium' };
  if (egfr >= 30) return { stage: 'G3b', label: 'Moderately to severely decreased', severity: 'high' };
  if (egfr >= 15) return { stage: 'G4', label: 'Severely decreased', severity: 'high' };
  return { stage: 'G5', label: 'Kidney failure', severity: 'critical' };
}

/* ───────────── FIB-4 ─────────────
 * Sterling RK et al. Hepatology 2006;43:1317-25.
 * FIB-4 = (age × AST) / (platelets [10⁹/L] × √ALT). */
export function fib4(age: number, ast: number, alt: number, platelets: number): number {
  if (alt <= 0 || platelets <= 0) throw new RangeError('ALT and platelets must be positive');
  return (age * ast) / (platelets * Math.sqrt(alt));
}

export function fib4Interpretation(score: number, age: number): { label: string; severity: 'low' | 'medium' | 'high' } {
  const low = age >= 65 ? 2.0 : 1.3;
  if (score < low) return { label: 'Advanced fibrosis unlikely', severity: 'low' };
  if (score <= 2.67) return { label: 'Indeterminate — consider elastography', severity: 'medium' };
  return { label: 'Advanced fibrosis likely — refer to hepatology', severity: 'high' };
}

/* ───────────── Framingham general CVD 10-year risk ─────────────
 * D'Agostino RB Sr et al. Circulation 2008;117:743-53 (office-based, lipid version).
 * risk = 1 − S₀^exp(Σβx − mean) with sex-specific β, S₀ and mean. */
export interface FraminghamInput {
  sex: Sex;
  age: number;
  totalChol: number;
  hdl: number;
  sbp: number;
  treatedBp: boolean;
  smoker: boolean;
  diabetic: boolean;
}

const FRAM = {
  male: { age: 3.06117, tc: 1.1237, hdl: -0.93263, sbpU: 1.93303, sbpT: 1.99881, smoke: 0.65451, dm: 0.57367, s0: 0.88936, mean: 23.9802 },
  female: { age: 2.32888, tc: 1.20904, hdl: -0.70833, sbpU: 2.76157, sbpT: 2.82263, smoke: 0.52873, dm: 0.69154, s0: 0.95012, mean: 26.1931 },
} as const;

export function framingham10y(i: FraminghamInput): number {
  const c = FRAM[i.sex];
  const sum =
    c.age * Math.log(i.age) +
    c.tc * Math.log(i.totalChol) +
    c.hdl * Math.log(i.hdl) +
    (i.treatedBp ? c.sbpT : c.sbpU) * Math.log(i.sbp) +
    (i.smoker ? c.smoke : 0) +
    (i.diabetic ? c.dm : 0);
  return 1 - c.s0 ** Math.exp(sum - c.mean);
}

export function framinghamCategory(risk: number): { label: string; severity: 'low' | 'medium' | 'high' } {
  if (risk < 0.1) return { label: 'Low (< 10%)', severity: 'low' };
  if (risk < 0.2) return { label: 'Intermediate (10–20%)', severity: 'medium' };
  return { label: 'High (≥ 20%)', severity: 'high' };
}

/* ───────────── BMI ─────────────
 * WHO global cut-offs and WHO expert consultation Asian cut-offs (Lancet 2004;363:157-63). */
export function bmi(weightKg: number, heightCm: number): number {
  if (heightCm <= 0) throw new RangeError('Height must be positive');
  const m = heightCm / 100;
  return weightKg / (m * m);
}

export function bmiCategory(value: number, asian = true): { label: string; severity: 'low' | 'medium' | 'high' } {
  if (value < 18.5) return { label: 'Underweight', severity: 'medium' };
  if (asian) {
    if (value < 23) return { label: 'Normal (Asian cut-off)', severity: 'low' };
    if (value < 25) return { label: 'Overweight (Asian cut-off ≥ 23)', severity: 'medium' };
    return { label: 'Obese (Asian cut-off ≥ 25)', severity: 'high' };
  }
  if (value < 25) return { label: 'Normal', severity: 'low' };
  if (value < 30) return { label: 'Overweight', severity: 'medium' };
  return { label: 'Obese', severity: 'high' };
}

/* ───────────── NEWS2 ─────────────
 * Royal College of Physicians. National Early Warning Score (NEWS) 2. London: RCP, 2017. */
export interface News2Input {
  respRate: number;
  spo2: number;
  /** SpO₂ scale 2 for confirmed hypercapnic respiratory failure. */
  scale2?: boolean;
  onOxygen: boolean;
  sbp: number;
  pulse: number;
  consciousness: 'A' | 'C' | 'V' | 'P' | 'U';
  temp: number;
}

export interface News2Result {
  total: number;
  parts: Record<'respRate' | 'spo2' | 'oxygen' | 'sbp' | 'pulse' | 'consciousness' | 'temp', number>;
  risk: 'low' | 'low-medium' | 'medium' | 'high';
  response: string;
}

function scoreRR(v: number) {
  if (v <= 8) return 3;
  if (v <= 11) return 1;
  if (v <= 20) return 0;
  if (v <= 24) return 2;
  return 3;
}

function scoreSpO2(v: number, scale2: boolean, onO2: boolean) {
  if (!scale2) {
    if (v <= 91) return 3;
    if (v <= 93) return 2;
    if (v <= 95) return 1;
    return 0;
  }
  if (v <= 83) return 3;
  if (v <= 85) return 2;
  if (v <= 87) return 1;
  if (v <= 92 || !onO2) return 0;
  if (v <= 94) return 1;
  if (v <= 96) return 2;
  return 3;
}

function scoreSBP(v: number) {
  if (v <= 90) return 3;
  if (v <= 100) return 2;
  if (v <= 110) return 1;
  if (v <= 219) return 0;
  return 3;
}

function scorePulse(v: number) {
  if (v <= 40) return 3;
  if (v <= 50) return 1;
  if (v <= 90) return 0;
  if (v <= 110) return 1;
  if (v <= 130) return 2;
  return 3;
}

function scoreTemp(v: number) {
  if (v <= 35.0) return 3;
  if (v <= 36.0) return 1;
  if (v <= 38.0) return 0;
  if (v <= 39.0) return 1;
  return 2;
}

export function news2(i: News2Input): News2Result {
  const parts = {
    respRate: scoreRR(i.respRate),
    spo2: scoreSpO2(i.spo2, !!i.scale2, i.onOxygen),
    oxygen: i.onOxygen ? 2 : 0,
    sbp: scoreSBP(i.sbp),
    pulse: scorePulse(i.pulse),
    consciousness: i.consciousness === 'A' ? 0 : 3,
    temp: scoreTemp(i.temp),
  };
  const total = Object.values(parts).reduce((a, b) => a + b, 0);
  const anyThree = Object.values(parts).some((p) => p === 3);
  let risk: News2Result['risk'] = 'low';
  if (total >= 7) risk = 'high';
  else if (total >= 5) risk = 'medium';
  else if (anyThree) risk = 'low-medium';
  const response = {
    low: total === 0 ? 'Continue routine monitoring (minimum 12-hourly)' : 'Inform registered nurse; monitor at least 4–6-hourly',
    'low-medium': 'Urgent ward-based review by a clinician (single parameter scored 3)',
    medium: 'Urgent response: clinician review; consider critical-care outreach; monitor at least hourly',
    high: 'Emergency response: critical-care team assessment; continuous monitoring',
  }[risk];
  return { total, parts, risk, response };
}

/* ───────────── CHA₂DS₂-VASc ─────────────
 * Lip GYH et al. Chest 2010;137:263-72. */
export interface Cha2ds2VascInput {
  chf: boolean;
  hypertension: boolean;
  age: number;
  diabetes: boolean;
  strokeTia: boolean;
  vascular: boolean;
  sex: Sex;
}

export function cha2ds2Vasc(i: Cha2ds2VascInput): number {
  return (
    (i.chf ? 1 : 0) +
    (i.hypertension ? 1 : 0) +
    (i.age >= 75 ? 2 : i.age >= 65 ? 1 : 0) +
    (i.diabetes ? 1 : 0) +
    (i.strokeTia ? 2 : 0) +
    (i.vascular ? 1 : 0) +
    (i.sex === 'female' ? 1 : 0)
  );
}

export function cha2ds2VascAdvice(score: number, sex: Sex): { label: string; severity: 'low' | 'medium' | 'high' } {
  const nonSex = sex === 'female' ? score - 1 : score;
  if (nonSex <= 0) return { label: 'Low risk — anticoagulation generally not recommended', severity: 'low' };
  if (nonSex === 1) return { label: 'Consider oral anticoagulation (shared decision)', severity: 'medium' };
  return { label: 'Oral anticoagulation recommended', severity: 'high' };
}

/* ───────────── qSOFA ─────────────
 * Seymour CW et al. JAMA 2016;315:762-74. */
export interface QsofaInput {
  respRate: number;
  sbp: number;
  alteredMentation: boolean;
}

export function qsofa(i: QsofaInput): number {
  return (i.respRate >= 22 ? 1 : 0) + (i.sbp <= 100 ? 1 : 0) + (i.alteredMentation ? 1 : 0);
}

export const CALCULATOR_SOURCES = {
  egfr: 'Inker LA et al. New creatinine- and cystatin C-based equations to estimate GFR without race. N Engl J Med 2021;385:1737-49.',
  fib4: 'Sterling RK et al. Development of a simple noninvasive index to predict significant fibrosis in patients with HIV/HCV coinfection. Hepatology 2006;43:1317-25.',
  framingham: "D'Agostino RB Sr et al. General cardiovascular risk profile for use in primary care: the Framingham Heart Study. Circulation 2008;117:743-53.",
  bmi: 'WHO Expert Consultation. Appropriate body-mass index for Asian populations and its implications for policy and intervention strategies. Lancet 2004;363:157-63.',
  news2: 'Royal College of Physicians. National Early Warning Score (NEWS) 2: Standardising the assessment of acute-illness severity in the NHS. London: RCP, 2017.',
  cha2ds2vasc: 'Lip GYH et al. Refining clinical risk stratification for predicting stroke and thromboembolism in atrial fibrillation. Chest 2010;137:263-72.',
  qsofa: 'Seymour CW et al. Assessment of clinical criteria for sepsis (Sepsis-3). JAMA 2016;315:762-74.',
} as const;
