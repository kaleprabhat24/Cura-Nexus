/**
 * Split-conformal uncertainty for the screening models, computed from a seeded synthetic
 * calibration set.
 *
 * Calibration data: n patients are drawn from each feature's population distribution. Their
 * "true" risk comes from a perturbed copy of the model (coefficients × (1 + ε), ε ~ N(0, 0.15),
 * intercept shift ~ N(0, 0.25)) — this simulates the model being misspecified. Labels are
 * Bernoulli(true risk).
 *
 * 1. Risk interval (normalised split-conformal regression):
 *      sᵢ = |p_trueᵢ − p̂ᵢ| / σ(p̂ᵢ),   σ(p) = √(p(1 − p)) + 0.05
 *      q̂ = the ⌈(n + 1)(1 − α)⌉-th smallest sᵢ
 *      interval = [p̂ − q̂σ(p̂), p̂ + q̂σ(p̂)] ∩ [0, 1]
 *    Coverage is with respect to the simulated true risk.
 * 2. Label prediction set (classic split conformal for classification):
 *      sᵢ = 1 − p̂(yᵢ);  set = { y : 1 − p̂(y) ≤ q̂ }  → {no disease}, {disease} or both.
 */
import { createRng } from '@/lib/prng';
import { RISK_MODELS, scoreRisk, type DiseaseKey, type RiskModel } from './models';

export interface CalibrationSet {
  model: DiseaseKey;
  n: number;
  alpha: number;
  qInterval: number;
  qLabel: number;
  /** Empirical coverage on an independent held-out simulation (sanity check). */
  heldOutCoverage: number;
  heldOutLabelCoverage: number;
  meanWidth: number;
}

export interface ConformalOutput {
  lower: number;
  upper: number;
  labelSet: ('no disease' | 'disease')[];
  alpha: number;
  calibrationSize: number;
}

const sigma = (p: number) => Math.sqrt(p * (1 - p)) + 0.05;

/** ⌈(n+1)(1−α)⌉-th order statistic (the finite-sample-valid conformal quantile). */
export function conformalQuantile(scores: number[], alpha: number): number {
  const sorted = [...scores].sort((a, b) => a - b);
  const k = Math.ceil((sorted.length + 1) * (1 - alpha));
  if (k > sorted.length) return Number.POSITIVE_INFINITY;
  return sorted[k - 1]!;
}

interface SimRow {
  phat: number;
  ptrue: number;
  y: 0 | 1;
}

/** perturbSeed fixes the simulated "true" generator; sampleSeed draws patients from it. */
function simulate(model: RiskModel, n: number, perturbSeed: number, sampleSeed: number): SimRow[] {
  const prng = createRng(perturbSeed);
  const perturbed: RiskModel = {
    ...model,
    intercept: model.intercept + prng.normal(0, 0.25),
    features: model.features.map((f) => ({ ...f, beta: f.beta * (1 + prng.normal(0, 0.15)) })),
  };
  const rng = createRng(sampleSeed);
  const rows: SimRow[] = [];
  for (let i = 0; i < n; i++) {
    const x: Record<string, number> = {};
    for (const f of model.features) {
      if ('p' in f.dist) x[f.key] = rng.chance(f.dist.p) ? 1 : 0;
      else {
        let v = rng.normal(f.dist.mean, f.dist.sd);
        if (f.transform === 'log') v = Math.abs(v) + 1;
        if (f.min !== undefined) v = Math.max(f.min, v);
        if (f.max !== undefined) v = Math.min(f.max, v);
        if (f.kind === 'select') v = Math.max(0, Math.min(4, Math.round(v)));
        x[f.key] = v;
      }
    }
    const phat = scoreRisk(model, x).probability;
    const ptrue = scoreRisk(perturbed, x).probability;
    rows.push({ phat, ptrue, y: rng.chance(ptrue) ? 1 : 0 });
  }
  return rows;
}

const cache = new Map<string, CalibrationSet>();

export function calibrate(key: DiseaseKey, n = 800, alpha = 0.05, seed = 20240901): CalibrationSet {
  const cacheKey = `${key}|${n}|${alpha}|${seed}`;
  const hit = cache.get(cacheKey);
  if (hit) return hit;
  const model = RISK_MODELS[key];
  const perturbSeed = seed + key.length * 7919;
  const cal = simulate(model, n, perturbSeed, seed + 1);
  const qInterval = conformalQuantile(
    cal.map((r) => Math.abs(r.ptrue - r.phat) / sigma(r.phat)),
    alpha,
  );
  const qLabel = conformalQuantile(
    cal.map((r) => 1 - (r.y === 1 ? r.phat : 1 - r.phat)),
    alpha,
  );
  // Independent simulation (same misspecified generator) to verify empirical coverage.
  const test = simulate(model, 600, perturbSeed, seed + 99_991);
  let covered = 0;
  let labelCovered = 0;
  let width = 0;
  for (const r of test) {
    const lo = Math.max(0, r.phat - qInterval * sigma(r.phat));
    const hi = Math.min(1, r.phat + qInterval * sigma(r.phat));
    if (r.ptrue >= lo && r.ptrue <= hi) covered++;
    width += hi - lo;
    const set = labelSetFor(r.phat, qLabel);
    if (set.includes(r.y === 1 ? 'disease' : 'no disease')) labelCovered++;
  }
  const result: CalibrationSet = {
    model: key,
    n,
    alpha,
    qInterval,
    qLabel,
    heldOutCoverage: covered / test.length,
    heldOutLabelCoverage: labelCovered / test.length,
    meanWidth: width / test.length,
  };
  cache.set(cacheKey, result);
  return result;
}

function labelSetFor(phat: number, q: number): ConformalOutput['labelSet'] {
  const set: ConformalOutput['labelSet'] = [];
  if (1 - (1 - phat) <= q) set.push('no disease');
  if (1 - phat <= q) set.push('disease');
  return set;
}

export function conformalInterval(key: DiseaseKey, phat: number, alpha = 0.05): ConformalOutput {
  const cal = calibrate(key, 800, alpha);
  return {
    lower: Math.max(0, phat - cal.qInterval * sigma(phat)),
    upper: Math.min(1, phat + cal.qInterval * sigma(phat)),
    labelSet: labelSetFor(phat, cal.qLabel),
    alpha,
    calibrationSize: cal.n,
  };
}
