/**
 * Digital twin — a 10-year multi-organ trajectory simulator.
 *
 * State y = [SBP (mmHg), eGFR (mL/min/1.73m²), HbA1c (%), weight (kg), LDL (mg/dL)].
 * Each variable relaxes towards an intervention-dependent set point with first-order
 * kinetics and is coupled to the others:
 *
 *   dW/dt    = k_w (W* − W),          W*   = W₀ (1 − 0.07·exercise)
 *   dA1c/dt  = k_a (A1c* − A1c) + d_a, A1c* = A1c₀ − 1.1·adh·DM − 0.4·exercise + 0.06 (W − W₀)
 *   dSBP/dt  = k_s (SBP* − SBP) + d_s, SBP* = SBP₀ − 14·adh·HTN − 5·exercise + 1.1 (W − W₀) + 3·smoking
 *   dLDL/dt  = k_l (LDL* − LDL),      LDL* = LDL₀ (1 − 0.45·statin·adh) (1 − 0.05·exercise)
 *   deGFR/dt = −[1 + 0.06·max(0, SBP − 130) + 0.5·max(0, A1c − 7)] (1 − 0.3·adh·HTN) √(eGFR/90)
 *
 * d_a, d_s are age-related drifts. Solved with classical 4th-order Runge–Kutta.
 * The coefficients are illustrative (effect sizes of the order reported in trials of
 * metformin, antihypertensives, statins and lifestyle change), not a validated model.
 */
import { framingham10y, type Sex } from './calculators';

export type Vec = number[];
export type Deriv = (t: number, y: Vec) => Vec;

export function rk4Step(f: Deriv, t: number, y: Vec, h: number): Vec {
  const k1 = f(t, y);
  const k2 = f(t + h / 2, y.map((v, i) => v + (h / 2) * k1[i]!));
  const k3 = f(t + h / 2, y.map((v, i) => v + (h / 2) * k2[i]!));
  const k4 = f(t + h, y.map((v, i) => v + h * k3[i]!));
  return y.map((v, i) => v + (h / 6) * (k1[i]! + 2 * k2[i]! + 2 * k3[i]! + k4[i]!));
}

export function eulerStep(f: Deriv, t: number, y: Vec, h: number): Vec {
  const k = f(t, y);
  return y.map((v, i) => v + h * k[i]!);
}

/** Integrate from t0 to t1 with fixed step h; returns samples at every step. */
export function solve(f: Deriv, y0: Vec, t0: number, t1: number, h: number, method: 'rk4' | 'euler' = 'rk4'): { t: number; y: Vec }[] {
  const out = [{ t: t0, y: y0 }];
  let y = y0;
  const steps = Math.round((t1 - t0) / h);
  for (let i = 0; i < steps; i++) {
    const t = t0 + i * h;
    y = method === 'rk4' ? rk4Step(f, t, y, h) : eulerStep(f, t, y, h);
    out.push({ t: Math.round((t + h) * 1e6) / 1e6, y });
  }
  return out;
}

export interface TwinBaseline {
  age: number;
  sex: Sex;
  sbp: number;
  egfr: number;
  hba1c: number;
  weight: number;
  ldl: number;
  hdl: number;
  diabetic: boolean;
  hypertensive: boolean;
  smoker: boolean;
}

export interface TwinInterventions {
  adherence: number; // 0–1 medication adherence
  statin: boolean;
  exercise: number; // 0–1 (0 = sedentary, 1 = ≥ 300 min/week)
  smokingCessation: boolean;
}

export interface TwinPoint {
  year: number;
  sbp: number;
  egfr: number;
  hba1c: number;
  weight: number;
  ldl: number;
  cvRisk: number;
}

export function simulateTwin(b: TwinBaseline, iv: TwinInterventions, years = 10, h = 0.05): TwinPoint[] {
  const adh = Math.max(0, Math.min(1, iv.adherence));
  const ex = Math.max(0, Math.min(1, iv.exercise));
  const smoking = b.smoker && !iv.smokingCessation ? 1 : 0;
  const dm = b.diabetic ? 1 : 0;
  const htn = b.hypertensive ? 1 : 0;
  const f: Deriv = (_t, [sbp, egfr, a1c, w, ldl]) => {
    const wSet = b.weight * (1 - 0.07 * ex);
    const aSet = b.hba1c - 1.1 * adh * dm - 0.4 * ex + 0.06 * (w! - b.weight);
    const sSet = b.sbp - 14 * adh * htn - 5 * ex + 1.1 * (w! - b.weight) + 3 * smoking;
    const lSet = b.ldl * (1 - 0.45 * (iv.statin ? 1 : 0) * Math.max(adh, 0.2)) * (1 - 0.05 * ex);
    const decline = (1 + 0.06 * Math.max(0, sbp! - 130) + 0.5 * Math.max(0, a1c! - 7)) * (1 - 0.3 * adh * htn) * Math.sqrt(Math.max(egfr!, 1) / 90);
    return [
      0.9 * (sSet - sbp!) + 0.5,
      -decline,
      0.8 * (aSet - a1c!) + 0.04 * dm,
      0.6 * (wSet - w!),
      1.2 * (lSet - ldl!),
    ];
  };
  const traj = solve(f, [b.sbp, b.egfr, b.hba1c, b.weight, b.ldl], 0, years, h);
  return traj
    .filter((p) => Math.abs(p.t * 4 - Math.round(p.t * 4)) < 1e-6) // quarterly samples
    .map(({ t, y }) => {
      const [sbp, egfr, a1c, w, ldl] = y as [number, number, number, number, number];
      const tchol = ldl + b.hdl + 30; // Friedewald rearranged with TG ≈ 150 mg/dL
      return {
        year: Math.round(t * 100) / 100,
        sbp,
        egfr: Math.max(egfr, 0),
        hba1c: a1c,
        weight: w,
        ldl,
        cvRisk: framingham10y({
          sex: b.sex,
          age: Math.min(b.age + t, 79),
          totalChol: tchol,
          hdl: b.hdl,
          sbp,
          treatedBp: htn === 1 && adh > 0.3,
          smoker: smoking === 1,
          diabetic: b.diabetic,
        }),
      };
    });
}
