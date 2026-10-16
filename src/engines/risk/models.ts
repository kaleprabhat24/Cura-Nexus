/**
 * Five transparent screening models (logistic regression with literature-inspired
 * coefficients). They are deliberately simple and fully inspectable:
 *
 *   logit(p) = β₀ + Σ βᵢ · (g(xᵢ) − g(refᵢ))
 *
 * where refᵢ is the reference (typical healthy adult) value and g is identity or ln.
 * β₀ is the log-odds of the reference person, so each term βᵢ·(g(xᵢ) − g(refᵢ)) is that
 * feature's additive contribution in log-odds — the explanation shown next to the score.
 * Coefficients are illustrative, informed by published risk scores (IDRS/FINDRISC,
 * Framingham/ASCVD, FIB-4 components, KFRE inputs, COPD screening questionnaires); they are
 * not fitted to patient data and must not be used for diagnosis.
 */

export type DiseaseKey = 'diabetes' | 'heart' | 'liver' | 'kidney' | 'lungs';

export interface FeatureDef {
  key: string;
  label: string;
  unit?: string;
  kind: 'number' | 'boolean' | 'select';
  min?: number;
  max?: number;
  step?: number;
  options?: { value: number; label: string }[];
  ref: number;
  beta: number;
  transform?: 'log';
  /** Population distribution for synthetic calibration data: mean/sd or prevalence. */
  dist: { mean: number; sd: number } | { p: number };
  help?: string;
}

export interface RiskModel {
  key: DiseaseKey;
  name: string;
  outcome: string;
  version: string;
  intercept: number; // log-odds at the reference profile
  features: FeatureDef[];
  thresholds: { medium: number; high: number };
  inspiredBy: string[];
  intendedUse: string;
  limitations: string[];
}

const logit = (p: number) => Math.log(p / (1 - p));

export const RISK_MODELS: Record<DiseaseKey, RiskModel> = {
  diabetes: {
    key: 'diabetes',
    name: 'Type 2 diabetes risk',
    outcome: 'Probability of undiagnosed or incident type 2 diabetes',
    version: '1.2.0',
    intercept: logit(0.08),
    thresholds: { medium: 0.2, high: 0.45 },
    inspiredBy: ['Mohan V et al. Indian Diabetes Risk Score (IDRS). J Assoc Physicians India 2005;53:759-63.', 'Lindström J, Tuomilehto J. FINDRISC. Diabetes Care 2003;26:725-31.'],
    intendedUse: 'Opportunistic screening of adults to prioritise confirmatory HbA1c / OGTT testing.',
    limitations: ['Not validated on any cohort — coefficients are illustrative.', 'Does not apply to type 1 or gestational diabetes.', 'Assumes laboratory values from accredited labs.'],
    features: [
      { key: 'age', label: 'Age', unit: 'years', kind: 'number', min: 18, max: 95, ref: 40, beta: 0.04, dist: { mean: 48, sd: 13 } },
      { key: 'bmi', label: 'BMI', unit: 'kg/m²', kind: 'number', min: 12, max: 60, step: 0.1, ref: 23, beta: 0.1, dist: { mean: 25.5, sd: 4.2 } },
      { key: 'waist', label: 'Waist circumference', unit: 'cm', kind: 'number', min: 50, max: 160, ref: 85, beta: 0.025, dist: { mean: 90, sd: 11 } },
      { key: 'fpg', label: 'Fasting plasma glucose', unit: 'mg/dL', kind: 'number', min: 50, max: 400, ref: 92, beta: 0.04, dist: { mean: 100, sd: 18 } },
      { key: 'hba1c', label: 'HbA1c', unit: '%', kind: 'number', min: 3.5, max: 15, step: 0.1, ref: 5.4, beta: 0.85, dist: { mean: 5.8, sd: 0.7 } },
      { key: 'familyHistory', label: 'Parent or sibling with diabetes', kind: 'boolean', ref: 0, beta: 0.6, dist: { p: 0.35 } },
      { key: 'inactive', label: 'Physically inactive (< 150 min/week)', kind: 'boolean', ref: 0, beta: 0.4, dist: { p: 0.5 } },
      { key: 'hypertension', label: 'Hypertension', kind: 'boolean', ref: 0, beta: 0.35, dist: { p: 0.3 } },
    ],
  },
  heart: {
    key: 'heart',
    name: 'Cardiovascular disease risk',
    outcome: 'Probability of a cardiovascular event over 10 years',
    version: '1.1.0',
    intercept: logit(0.05),
    thresholds: { medium: 0.1, high: 0.2 },
    inspiredBy: ["D'Agostino RB Sr et al. Framingham general CVD. Circulation 2008;117:743-53.", 'Goff DC Jr et al. 2013 ACC/AHA Pooled Cohort Equations. Circulation 2014;129:S49-73.'],
    intendedUse: 'Primary-prevention risk discussion and statin/BP treatment prioritisation.',
    limitations: ['Illustrative coefficients; South Asian risk is often underestimated by Western scores.', 'Not for patients with established CVD.'],
    features: [
      { key: 'age', label: 'Age', unit: 'years', kind: 'number', min: 30, max: 90, ref: 45, beta: 0.065, dist: { mean: 52, sd: 11 } },
      { key: 'male', label: 'Male sex', kind: 'boolean', ref: 0, beta: 0.45, dist: { p: 0.5 } },
      { key: 'sbp', label: 'Systolic BP', unit: 'mmHg', kind: 'number', min: 80, max: 240, ref: 120, beta: 0.018, dist: { mean: 132, sd: 17 } },
      { key: 'tchol', label: 'Total cholesterol', unit: 'mg/dL', kind: 'number', min: 90, max: 400, ref: 180, beta: 0.006, dist: { mean: 192, sd: 36 } },
      { key: 'hdl', label: 'HDL cholesterol', unit: 'mg/dL', kind: 'number', min: 15, max: 120, ref: 50, beta: -0.025, dist: { mean: 44, sd: 10 } },
      { key: 'smoker', label: 'Current smoker', kind: 'boolean', ref: 0, beta: 0.65, dist: { p: 0.2 } },
      { key: 'diabetic', label: 'Diabetes', kind: 'boolean', ref: 0, beta: 0.6, dist: { p: 0.2 } },
      { key: 'bpTreated', label: 'On BP treatment', kind: 'boolean', ref: 0, beta: 0.25, dist: { p: 0.25 } },
      { key: 'familyHistory', label: 'Premature CAD in first-degree relative', kind: 'boolean', ref: 0, beta: 0.4, dist: { p: 0.15 } },
    ],
  },
  liver: {
    key: 'liver',
    name: 'Chronic liver disease risk',
    outcome: 'Probability of clinically significant liver fibrosis',
    version: '1.0.3',
    intercept: logit(0.04),
    thresholds: { medium: 0.12, high: 0.3 },
    inspiredBy: ['Sterling RK et al. FIB-4. Hepatology 2006;43:1317-25.', 'Angulo P et al. NAFLD fibrosis score. Hepatology 2007;45:846-54.'],
    intendedUse: 'Triage of abnormal liver tests for elastography / hepatology referral.',
    limitations: ['Illustrative coefficients.', 'Acute hepatitis and drug-induced injury inflate transaminases.'],
    features: [
      { key: 'age', label: 'Age', unit: 'years', kind: 'number', min: 18, max: 90, ref: 40, beta: 0.035, dist: { mean: 47, sd: 12 } },
      { key: 'ast', label: 'AST', unit: 'U/L', kind: 'number', min: 5, max: 1000, ref: 25, beta: 0.9, transform: 'log', dist: { mean: 32, sd: 14 } },
      { key: 'alt', label: 'ALT', unit: 'U/L', kind: 'number', min: 5, max: 1000, ref: 25, beta: 0.3, transform: 'log', dist: { mean: 34, sd: 16 } },
      { key: 'platelets', label: 'Platelets', unit: '10⁹/L', kind: 'number', min: 20, max: 700, ref: 260, beta: -1.6, transform: 'log', dist: { mean: 245, sd: 60 } },
      { key: 'albumin', label: 'Albumin', unit: 'g/dL', kind: 'number', min: 1.5, max: 6, step: 0.1, ref: 4.3, beta: -0.9, dist: { mean: 4.1, sd: 0.4 } },
      { key: 'bilirubin', label: 'Total bilirubin', unit: 'mg/dL', kind: 'number', min: 0.1, max: 30, step: 0.1, ref: 0.7, beta: 0.45, dist: { mean: 0.8, sd: 0.3 } },
      { key: 'alcohol', label: 'Alcohol', unit: 'units/week', kind: 'number', min: 0, max: 100, ref: 0, beta: 0.03, dist: { mean: 6, sd: 8 } },
      { key: 'bmi', label: 'BMI', unit: 'kg/m²', kind: 'number', min: 12, max: 60, step: 0.1, ref: 23, beta: 0.06, dist: { mean: 25.5, sd: 4.2 } },
      { key: 'diabetic', label: 'Diabetes', kind: 'boolean', ref: 0, beta: 0.55, dist: { p: 0.2 } },
    ],
  },
  kidney: {
    key: 'kidney',
    name: 'Chronic kidney disease progression risk',
    outcome: 'Probability of CKD progression (≥ 40% eGFR decline) over 5 years',
    version: '1.0.1',
    intercept: logit(0.03),
    thresholds: { medium: 0.1, high: 0.25 },
    inspiredBy: ['Tangri N et al. Kidney Failure Risk Equation. JAMA 2011;305:1553-9.', 'KDIGO 2024 CKD guideline (eGFR × albuminuria heat map).'],
    intendedUse: 'Prioritise nephrology follow-up and RAAS/SGLT2 optimisation in adults with diabetes or hypertension.',
    limitations: ['Illustrative coefficients — not the KFRE.', 'Single creatinine values can be affected by hydration and muscle mass.'],
    features: [
      { key: 'age', label: 'Age', unit: 'years', kind: 'number', min: 18, max: 95, ref: 45, beta: 0.02, dist: { mean: 54, sd: 13 } },
      { key: 'egfr', label: 'eGFR', unit: 'mL/min/1.73m²', kind: 'number', min: 5, max: 150, ref: 95, beta: -0.045, dist: { mean: 82, sd: 22 } },
      { key: 'uacr', label: 'Urine albumin/creatinine', unit: 'mg/g', kind: 'number', min: 1, max: 5000, ref: 10, beta: 0.55, transform: 'log', dist: { mean: 40, sd: 60 } },
      { key: 'hb', label: 'Haemoglobin', unit: 'g/dL', kind: 'number', min: 5, max: 20, step: 0.1, ref: 13.8, beta: -0.15, dist: { mean: 13, sd: 1.6 } },
      { key: 'sbp', label: 'Systolic BP', unit: 'mmHg', kind: 'number', min: 80, max: 240, ref: 120, beta: 0.015, dist: { mean: 134, sd: 18 } },
      { key: 'diabetic', label: 'Diabetes', kind: 'boolean', ref: 0, beta: 0.55, dist: { p: 0.3 } },
      { key: 'hypertension', label: 'Hypertension', kind: 'boolean', ref: 0, beta: 0.4, dist: { p: 0.4 } },
    ],
  },
  lungs: {
    key: 'lungs',
    name: 'Chronic lung disease (COPD) risk',
    outcome: 'Probability of spirometry-confirmed COPD',
    version: '1.0.2',
    intercept: logit(0.03),
    thresholds: { medium: 0.12, high: 0.3 },
    inspiredBy: ['Price DB et al. COPD Diagnostic Questionnaire. Chest 2006;129:1531-9.', 'Salvi S, Barnes PJ. Chronic obstructive pulmonary disease in non-smokers (biomass exposure). Lancet 2009;374:733-43.'],
    intendedUse: 'Case-finding for spirometry referral, including biomass-exposed non-smokers.',
    limitations: ['Illustrative coefficients.', 'Asthma and post-TB lung disease can mimic obstruction.'],
    features: [
      { key: 'age', label: 'Age', unit: 'years', kind: 'number', min: 18, max: 95, ref: 40, beta: 0.04, dist: { mean: 50, sd: 13 } },
      { key: 'packYears', label: 'Smoking', unit: 'pack-years', kind: 'number', min: 0, max: 150, ref: 0, beta: 0.04, dist: { mean: 6, sd: 10 } },
      { key: 'fev1fvc', label: 'FEV1/FVC', unit: '%', kind: 'number', min: 20, max: 100, ref: 80, beta: -0.09, dist: { mean: 76, sd: 8 } },
      { key: 'spo2', label: 'Resting SpO₂', unit: '%', kind: 'number', min: 70, max: 100, ref: 98, beta: -0.2, dist: { mean: 97, sd: 1.8 } },
      { key: 'cough', label: 'Chronic productive cough', kind: 'boolean', ref: 0, beta: 0.7, dist: { p: 0.2 } },
      {
        key: 'mmrc',
        label: 'Breathlessness (mMRC grade)',
        kind: 'select',
        ref: 0,
        beta: 0.45,
        options: [
          { value: 0, label: '0 — only with strenuous exercise' },
          { value: 1, label: '1 — hurrying or walking uphill' },
          { value: 2, label: '2 — walks slower than peers' },
          { value: 3, label: '3 — stops after ~100 m' },
          { value: 4, label: '4 — too breathless to leave house' },
        ],
        dist: { mean: 0.8, sd: 1 },
      },
      { key: 'biomass', label: 'Biomass fuel or occupational dust exposure', kind: 'boolean', ref: 0, beta: 0.55, dist: { p: 0.3 } },
    ],
  },
};

export const DISEASE_KEYS = Object.keys(RISK_MODELS) as DiseaseKey[];

export interface Contribution {
  key: string;
  label: string;
  value: number;
  /** Additive log-odds contribution relative to the reference profile. */
  logOdds: number;
}

export interface RiskResult {
  model: DiseaseKey;
  version: string;
  probability: number;
  logit: number;
  tier: 'low' | 'medium' | 'high';
  baseline: number; // probability at the reference profile
  contributions: Contribution[];
}

const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));
const g = (f: FeatureDef, x: number) => (f.transform === 'log' ? Math.log(Math.max(x, 1e-6)) : x);

export function defaultInputs(model: RiskModel): Record<string, number> {
  return Object.fromEntries(model.features.map((f) => [f.key, f.kind === 'number' ? Math.round(('mean' in f.dist ? f.dist.mean : f.ref) * 10) / 10 : 0]));
}

export function scoreRisk(model: RiskModel, inputs: Record<string, number>): RiskResult {
  const contributions: Contribution[] = model.features.map((f) => {
    const raw = inputs[f.key];
    const value = typeof raw === 'number' && Number.isFinite(raw) ? raw : f.ref;
    return { key: f.key, label: f.label, value, logOdds: f.beta * (g(f, value) - g(f, f.ref)) };
  });
  const z = model.intercept + contributions.reduce((s, c) => s + c.logOdds, 0);
  const probability = sigmoid(z);
  const tier = probability >= model.thresholds.high ? 'high' : probability >= model.thresholds.medium ? 'medium' : 'low';
  return {
    model: model.key,
    version: model.version,
    probability,
    logit: z,
    tier,
    baseline: sigmoid(model.intercept),
    contributions: contributions.sort((a, b) => Math.abs(b.logOdds) - Math.abs(a.logOdds)),
  };
}

/** Validate inputs against feature bounds; returns a map of field → message. */
export function validateInputs(model: RiskModel, inputs: Record<string, number>): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const f of model.features) {
    const v = inputs[f.key];
    if (v === undefined || Number.isNaN(v)) {
      errors[f.key] = `${f.label} is required`;
      continue;
    }
    if (f.kind === 'number' && ((f.min !== undefined && v < f.min) || (f.max !== undefined && v > f.max))) {
      errors[f.key] = `${f.label} must be between ${f.min} and ${f.max}${f.unit ? ` ${f.unit}` : ''}`;
    }
  }
  return errors;
}
