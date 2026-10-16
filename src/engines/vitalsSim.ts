/**
 * Streaming vital-signs simulator for the ICU/ward monitor.
 * Each signal follows a mean-reverting Ornstein–Uhlenbeck process
 *   x ← x + θ(μ − x)Δt + σ√Δt·ε,  ε ~ N(0, 1)
 * around a patient-specific baseline. Patients flagged as "deteriorating" drift their
 * baseline (tachycardia, falling SpO₂ and BP, rising RR and temperature), which NEWS2 picks up.
 */
import { createRng, type Rng } from '@/lib/prng';
import { news2, type News2Result } from './calculators';

export interface VitalsState {
  hr: number;
  spo2: number;
  sbp: number;
  dbp: number;
  rr: number;
  temp: number;
  onOxygen: boolean;
  consciousness: 'A' | 'C' | 'V' | 'P' | 'U';
}

export interface MonitorPatient {
  id: string;
  baseline: VitalsState;
  state: VitalsState;
  deteriorating: boolean;
  rng: Rng;
  tick: number;
}

const PARAMS: Record<'hr' | 'spo2' | 'sbp' | 'dbp' | 'rr' | 'temp', { theta: number; sigma: number; min: number; max: number }> = {
  hr: { theta: 0.25, sigma: 3, min: 30, max: 190 },
  spo2: { theta: 0.3, sigma: 0.7, min: 70, max: 100 },
  sbp: { theta: 0.2, sigma: 3.5, min: 60, max: 230 },
  dbp: { theta: 0.2, sigma: 2.5, min: 35, max: 140 },
  rr: { theta: 0.3, sigma: 1, min: 6, max: 45 },
  temp: { theta: 0.15, sigma: 0.05, min: 34, max: 41.5 },
};

export function createMonitorPatient(id: string, seed: number, deteriorating = false): MonitorPatient {
  const rng = createRng(seed);
  const baseline: VitalsState = {
    hr: Math.round(rng.normal(84, 10)),
    spo2: Math.round(rng.normal(96, 1.2)),
    sbp: Math.round(rng.normal(124, 12)),
    dbp: Math.round(rng.normal(76, 8)),
    rr: Math.round(rng.normal(17, 2)),
    temp: Math.round(rng.normal(37, 0.35) * 10) / 10,
    onOxygen: rng.chance(0.3),
    consciousness: 'A',
  };
  return { id, baseline, state: { ...baseline }, deteriorating, rng, tick: 0 };
}

export function stepVitals(p: MonitorPatient, dt = 1): MonitorPatient {
  const tick = p.tick + 1;
  // Deterioration: baseline drifts over ~60 ticks, then plateaus.
  const drift = p.deteriorating ? Math.min(1, tick / 60) : 0;
  const target = {
    hr: p.baseline.hr + 30 * drift,
    spo2: p.baseline.spo2 - 6 * drift,
    sbp: p.baseline.sbp - 28 * drift,
    dbp: p.baseline.dbp - 14 * drift,
    rr: p.baseline.rr + 9 * drift,
    temp: p.baseline.temp + 1.4 * drift,
  };
  const next = { ...p.state };
  (Object.keys(PARAMS) as (keyof typeof PARAMS)[]).forEach((k) => {
    const { theta, sigma, min, max } = PARAMS[k];
    const v = p.state[k] + theta * (target[k] - p.state[k]) * dt + sigma * Math.sqrt(dt) * p.rng.normal();
    next[k] = Math.max(min, Math.min(max, k === 'temp' ? Math.round(v * 10) / 10 : Math.round(v)));
  });
  next.consciousness = p.deteriorating && drift > 0.85 && p.rng.chance(0.05) ? 'C' : p.state.consciousness;
  return { ...p, state: next, tick };
}

export function newsFor(v: VitalsState): News2Result {
  return news2({ respRate: v.rr, spo2: v.spo2, onOxygen: v.onOxygen, sbp: v.sbp, pulse: v.hr, consciousness: v.consciousness, temp: v.temp });
}

/** Synthetic ECG-like waveform sample (sum of Gaussians for P, QRS, T) at phase 0..1. */
export function ecgSample(phase: number): number {
  const g = (mu: number, s: number, a: number) => a * Math.exp(-((phase - mu) ** 2) / (2 * s * s));
  return g(0.18, 0.025, 0.12) + g(0.36, 0.008, -0.12) + g(0.4, 0.01, 1) + g(0.43, 0.009, -0.25) + g(0.68, 0.045, 0.3);
}
