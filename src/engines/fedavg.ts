/**
 * Federated averaging (McMahan et al., AISTATS 2017) for logistic regression, simulated
 * across virtual hospital nodes in the browser.
 *
 * Each round: every node starts from the global weights w, runs E epochs of mini-batch SGD
 * on its private data, and returns its weights wₖ. The server sets
 *   w ← Σₖ (nₖ / n) · wₖ
 * Optional differential privacy (DP-FedAvg, McMahan et al. ICLR 2018): each client update
 * Δₖ = wₖ − w is clipped to L2 norm C, and Gaussian noise N(0, (σC)²) is added to the sum.
 * Raw rows never leave a node — only weight vectors are exchanged.
 */
import { createRng, type Rng } from '@/lib/prng';
import { RISK_MODELS } from './risk/models';

export interface Dataset {
  X: number[][]; // standardised features, with a leading 1 for the bias
  y: number[];
}

export interface NodeSpec {
  id: string;
  name: string;
  city: string;
  n: number;
  /** Covariate shift: added to each standardised feature mean. */
  shift: number;
  prevalenceBoost: number;
}

export const DEFAULT_NODES: NodeSpec[] = [
  { id: 'n1', name: 'Cura Nexus — Pune', city: 'Pune', n: 420, shift: 0, prevalenceBoost: 0 },
  { id: 'n2', name: 'District Hospital — Nashik', city: 'Nashik', n: 260, shift: 0.25, prevalenceBoost: 0.3 },
  { id: 'n3', name: 'Urban PHC — Mumbai', city: 'Mumbai', n: 180, shift: -0.2, prevalenceBoost: -0.2 },
  { id: 'n4', name: 'Teaching Hospital — Nagpur', city: 'Nagpur', n: 340, shift: 0.1, prevalenceBoost: 0.15 },
];

const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));
const dot = (a: number[], b: number[]) => a.reduce((s, v, i) => s + v * b[i]!, 0);

export const FEATURE_KEYS = RISK_MODELS.diabetes.features.map((f) => f.key);

/** Generate a node's private dataset from the diabetes model's generative assumptions. */
export function generateDataset(n: number, rng: Rng, shift = 0, prevalenceBoost = 0): Dataset {
  const model = RISK_MODELS.diabetes;
  const X: number[][] = [];
  const y: number[] = [];
  for (let i = 0; i < n; i++) {
    const raw: Record<string, number> = {};
    const row = [1];
    for (const f of model.features) {
      if ('p' in f.dist) {
        const v = rng.chance(Math.min(0.95, f.dist.p * (1 + shift))) ? 1 : 0;
        raw[f.key] = v;
        row.push(v);
      } else {
        const z = rng.normal(shift, 1);
        raw[f.key] = f.dist.mean + z * f.dist.sd;
        row.push(z);
      }
    }
    const logit = model.intercept + prevalenceBoost + model.features.reduce((s, f) => s + f.beta * (raw[f.key]! - f.ref), 0);
    y.push(rng.chance(sigmoid(logit)) ? 1 : 0);
    X.push(row);
  }
  return { X, y };
}

export function predict(w: number[], x: number[]): number {
  return sigmoid(dot(w, x));
}

export function trainLocal(w0: number[], data: Dataset, epochs: number, lr: number, batch: number, rng: Rng, l2 = 1e-3): number[] {
  const w = [...w0];
  const idx = data.X.map((_, i) => i);
  for (let e = 0; e < epochs; e++) {
    const order = rng.shuffle(idx);
    for (let s = 0; s < order.length; s += batch) {
      const grad = new Array<number>(w.length).fill(0);
      const slice = order.slice(s, s + batch);
      for (const i of slice) {
        const err = predict(w, data.X[i]!) - data.y[i]!;
        data.X[i]!.forEach((v, j) => (grad[j]! += err * v));
      }
      for (let j = 0; j < w.length; j++) w[j]! -= lr * (grad[j]! / slice.length + l2 * w[j]!);
    }
  }
  return w;
}

export function accuracy(w: number[], data: Dataset): number {
  let ok = 0;
  data.X.forEach((x, i) => (ok += (predict(w, x) >= 0.5 ? 1 : 0) === data.y[i] ? 1 : 0));
  return ok / data.X.length;
}

/** ROC AUC via the Mann–Whitney U statistic. */
export function auc(w: number[], data: Dataset): number {
  const scored = data.X.map((x, i) => ({ s: predict(w, x), y: data.y[i]! })).sort((a, b) => a.s - b.s);
  let rank = 0;
  let sumPos = 0;
  let pos = 0;
  for (let i = 0; i < scored.length; ) {
    let j = i;
    while (j < scored.length && scored[j]!.s === scored[i]!.s) j++;
    const avgRank = (i + j + 1) / 2;
    for (let k = i; k < j; k++) if (scored[k]!.y === 1) {
      sumPos += avgRank;
      pos++;
    }
    rank = j;
    i = j;
  }
  const neg = rank - pos;
  if (!pos || !neg) return 0.5;
  return (sumPos - (pos * (pos + 1)) / 2) / (pos * neg);
}

export function logLoss(w: number[], data: Dataset): number {
  let s = 0;
  data.X.forEach((x, i) => {
    const p = Math.min(1 - 1e-9, Math.max(1e-9, predict(w, x)));
    s += -(data.y[i]! * Math.log(p) + (1 - data.y[i]!) * Math.log(1 - p));
  });
  return s / data.X.length;
}

export interface FedConfig {
  rounds: number;
  localEpochs: number;
  lr: number;
  batch: number;
  dp: boolean;
  clip: number;
  noiseMultiplier: number;
  seed: number;
  nodes: NodeSpec[];
}

export const DEFAULT_FED_CONFIG: FedConfig = { rounds: 15, localEpochs: 2, lr: 0.15, batch: 16, dp: false, clip: 1.0, noiseMultiplier: 0.8, seed: 7, nodes: DEFAULT_NODES };

export interface RoundMetrics {
  round: number;
  globalAccuracy: number;
  globalAuc: number;
  globalLoss: number;
  perNode: { id: string; accuracy: number; auc: number }[];
  updateNorm: number;
}

export interface FedRun {
  config: FedConfig;
  rounds: RoundMetrics[];
  weights: number[];
  localOnly: { id: string; auc: number; accuracy: number }[];
  centralised: { auc: number; accuracy: number };
  testSize: number;
  bytesExchanged: number;
  epsilonNote: string;
}

export function runFedAvg(config: FedConfig = DEFAULT_FED_CONFIG, onRound?: (m: RoundMetrics) => void): FedRun {
  const rng = createRng(config.seed);
  const nodes = config.nodes.map((spec) => ({ spec, train: generateDataset(spec.n, rng, spec.shift, spec.prevalenceBoost), test: generateDataset(Math.round(spec.n * 0.3), rng, spec.shift, spec.prevalenceBoost) }));
  const globalTest: Dataset = { X: nodes.flatMap((n) => n.test.X), y: nodes.flatMap((n) => n.test.y) };
  const dim = FEATURE_KEYS.length + 1;
  let w = new Array<number>(dim).fill(0);
  const total = nodes.reduce((s, n) => s + n.train.X.length, 0);
  const rounds: RoundMetrics[] = [];
  let bytes = 0;
  for (let r = 1; r <= config.rounds; r++) {
    const deltas: number[][] = [];
    for (const n of nodes) {
      const wk = trainLocal(w, n.train, config.localEpochs, config.lr, config.batch, rng);
      let delta = wk.map((v, i) => v - w[i]!);
      if (config.dp) {
        const norm = Math.sqrt(delta.reduce((s, v) => s + v * v, 0));
        const scale = Math.min(1, config.clip / (norm || 1));
        delta = delta.map((v) => v * scale);
      }
      deltas.push(delta.map((v) => v * (config.dp ? 1 / nodes.length : n.train.X.length / total)));
      bytes += dim * 8 * 2; // weights down + update up (float64)
    }
    const agg = new Array<number>(dim).fill(0);
    for (const d of deltas) d.forEach((v, i) => (agg[i]! += v));
    if (config.dp) for (let i = 0; i < dim; i++) agg[i]! += rng.normal(0, (config.noiseMultiplier * config.clip) / nodes.length);
    const updateNorm = Math.sqrt(agg.reduce((s, v) => s + v * v, 0));
    w = w.map((v, i) => v + agg[i]!);
    const m: RoundMetrics = {
      round: r,
      globalAccuracy: accuracy(w, globalTest),
      globalAuc: auc(w, globalTest),
      globalLoss: logLoss(w, globalTest),
      perNode: nodes.map((n) => ({ id: n.spec.id, accuracy: accuracy(w, n.test), auc: auc(w, n.test) })),
      updateNorm,
    };
    rounds.push(m);
    onRound?.(m);
  }
  const localOnly = nodes.map((n) => {
    const wl = trainLocal(new Array<number>(dim).fill(0), n.train, config.rounds * config.localEpochs, config.lr, config.batch, rng);
    return { id: n.spec.id, auc: auc(wl, globalTest), accuracy: accuracy(wl, globalTest) };
  });
  const pooled: Dataset = { X: nodes.flatMap((n) => n.train.X), y: nodes.flatMap((n) => n.train.y) };
  const wc = trainLocal(new Array<number>(dim).fill(0), pooled, config.rounds * config.localEpochs, config.lr, config.batch, rng);
  return {
    config,
    rounds,
    weights: w,
    localOnly,
    centralised: { auc: auc(wc, globalTest), accuracy: accuracy(wc, globalTest) },
    testSize: globalTest.X.length,
    bytesExchanged: bytes,
    epsilonNote: config.dp
      ? `Clipping C = ${config.clip}, noise multiplier σ = ${config.noiseMultiplier}. A formal (ε, δ) requires a privacy accountant (e.g. RDP); this demo reports the mechanism parameters only.`
      : 'Differential privacy disabled.',
  };
}
