/**
 * Master Patient Index — Fellegi–Sunter probabilistic record linkage.
 *
 * For each field with agreement probability m = P(agree | same person) and
 * u = P(agree | different people):
 *   agreement weight    w⁺ = log₂(m / u)
 *   disagreement weight w⁻ = log₂((1 − m) / (1 − u))
 * String fields use Jaro–Winkler; similarities between the partial and full agreement
 * thresholds interpolate linearly between w⁻ and w⁺ (Winkler's adjustment). Missing values
 * contribute 0. The total weight is compared with an upper (match) and lower (possible
 * match) threshold. Names are compared both raw and after Indian-English phonetic
 * normalisation (e.g. "Laxmi" ≈ "Lakshmi"), and given/family swaps are detected.
 */
import { jaroWinkler, soundex } from './jaroWinkler';

export interface MpiRecord {
  id: string;
  given: string;
  family: string;
  birthDate?: string;
  gender?: string;
  phone?: string;
  abha?: string;
  mrn?: string;
  city?: string;
  postalCode?: string;
  addressLine?: string;
}

export interface FieldParams {
  m: number;
  u: number;
}

export const DEFAULT_PARAMS: Record<MpiField, FieldParams> = {
  given: { m: 0.95, u: 0.02 },
  family: { m: 0.95, u: 0.06 },
  birthDate: { m: 0.97, u: 0.003 },
  gender: { m: 0.98, u: 0.5 },
  phone: { m: 0.85, u: 0.0005 },
  abha: { m: 0.99, u: 0.00001 },
  postalCode: { m: 0.85, u: 0.01 },
  city: { m: 0.9, u: 0.1 },
  address: { m: 0.8, u: 0.02 },
};

export type MpiField = 'given' | 'family' | 'birthDate' | 'gender' | 'phone' | 'abha' | 'postalCode' | 'city' | 'address';

export const THRESHOLDS = { match: 14, possible: 6 } as const;

export type Comparison = 'agree' | 'partial' | 'disagree' | 'missing';

export interface FieldScore {
  field: MpiField;
  label: string;
  a?: string;
  b?: string;
  comparison: Comparison;
  similarity: number;
  weight: number;
  note?: string;
}

export type MatchClass = 'match' | 'possible' | 'no-match';

export interface MatchResult {
  aId: string;
  bId: string;
  score: number;
  classification: MatchClass;
  fields: FieldScore[];
  maxScore: number;
}

const LABELS: Record<MpiField, string> = {
  given: 'Given name',
  family: 'Family name',
  birthDate: 'Date of birth',
  gender: 'Gender',
  phone: 'Phone',
  abha: 'ABHA number',
  postalCode: 'PIN code',
  city: 'City',
  address: 'Address tokens',
};

const log2 = (x: number) => Math.log(x) / Math.LN2;
export const agreeWeight = (p: FieldParams) => log2(p.m / p.u);
export const disagreeWeight = (p: FieldParams) => log2((1 - p.m) / (1 - p.u));

const HONORIFICS = /\b(mr|mrs|ms|miss|dr|smt|shri|sri|kumari|km|md|mohd|late|master|baby)\b\.?/g;

export function normalizeName(s: string | undefined): string {
  return (s ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(HONORIFICS, ' ')
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Phonetic folding for common Indian-English transliteration variants. */
export function phoneticFold(s: string): string {
  return normalizeName(s)
    .replace(/ksh/g, 'x')
    .replace(/kh/g, 'k')
    .replace(/gh/g, 'g')
    .replace(/bh/g, 'b')
    .replace(/dh/g, 'd')
    .replace(/th/g, 't')
    .replace(/ph/g, 'f')
    .replace(/sh/g, 's')
    .replace(/w/g, 'v')
    .replace(/z/g, 'j')
    .replace(/ee/g, 'i')
    .replace(/oo/g, 'u')
    .replace(/aa/g, 'a')
    .replace(/y$/g, 'i')
    .replace(/(.)\1+/g, '$1')
    .replace(/\s/g, '');
}

export function nameSimilarity(a: string, b: string): number {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return 0;
  const raw = jaroWinkler(na, nb);
  const folded = jaroWinkler(phoneticFold(na), phoneticFold(nb));
  // Initials ("R." vs "Ramesh") count as a weak agreement.
  const initial = (na.length === 1 || nb.length === 1) && na[0] === nb[0] ? 0.9 : 0;
  return Math.max(raw, folded * 0.98, initial);
}

const digits = (s: string | undefined) => (s ?? '').replace(/\D/g, '');

export function normalizePhone(s: string | undefined): string {
  const d = digits(s);
  return d.length > 10 ? d.slice(-10) : d;
}

/** Date similarity: exact = 1; transposed day/month, ±1 day or same day-month ±1 year = 0.8; same year-month = 0.6. */
export function dateSimilarity(a: string | undefined, b: string | undefined): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const [ya, ma, da] = a.split('-').map(Number) as [number, number, number];
  const [yb, mb, db] = b.split('-').map(Number) as [number, number, number];
  if (ya === yb && ma === db && da === mb) return 0.8;
  if (ma === mb && da === db && Math.abs(ya - yb) === 1) return 0.8;
  const diffDays = Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 86_400_000;
  if (diffDays <= 1) return 0.8;
  if (ya === yb && ma === mb) return 0.6;
  return 0;
}

export function tokenSet(s: string | undefined): Set<string> {
  return new Set(
    normalizeName(s)
      .split(' ')
      .filter((t) => t.length > 2 && !['road', 'street', 'nagar', 'colony', 'flat', 'house', 'near', 'sector'].includes(t)),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  a.forEach((t) => b.has(t) && inter++);
  return inter / (a.size + b.size - inter);
}

function scoreField(
  field: MpiField,
  a: string | undefined,
  b: string | undefined,
  similarity: number,
  partialAt: number,
  fullAt: number,
  params: FieldParams,
  note?: string,
): FieldScore {
  const label = LABELS[field];
  if (!a || !b) return { field, label, a, b, comparison: 'missing', similarity: 0, weight: 0 };
  const wPlus = agreeWeight(params);
  const wMinus = disagreeWeight(params);
  let weight: number;
  let comparison: Comparison;
  if (similarity >= fullAt) {
    weight = wPlus;
    comparison = 'agree';
  } else if (similarity >= partialAt) {
    const f = (similarity - partialAt) / (fullAt - partialAt);
    weight = wMinus + (wPlus - wMinus) * (0.35 + 0.65 * f);
    comparison = 'partial';
  } else {
    weight = wMinus;
    comparison = 'disagree';
  }
  return { field, label, a, b, comparison, similarity, weight, note };
}

export function compareRecords(a: MpiRecord, b: MpiRecord, params: Record<MpiField, FieldParams> = DEFAULT_PARAMS): MatchResult {
  const fields: FieldScore[] = [];

  // Names, with swap detection (given/family order varies across Indian source systems).
  const straight = (nameSimilarity(a.given, b.given) + nameSimilarity(a.family, b.family)) / 2;
  const swapped = (nameSimilarity(a.given, b.family) + nameSimilarity(a.family, b.given)) / 2;
  const useSwap = swapped > straight + 0.05 && swapped >= 0.9;
  const gSim = useSwap ? nameSimilarity(a.given, b.family) : nameSimilarity(a.given, b.given);
  const fSim = useSwap ? nameSimilarity(a.family, b.given) : nameSimilarity(a.family, b.family);
  fields.push(scoreField('given', a.given, useSwap ? b.family : b.given, gSim, 0.82, 0.94, params.given, useSwap ? 'given/family swapped' : undefined));
  fields.push(scoreField('family', a.family, useSwap ? b.given : b.family, fSim, 0.82, 0.94, params.family, useSwap ? 'given/family swapped' : undefined));

  fields.push(scoreField('birthDate', a.birthDate, b.birthDate, dateSimilarity(a.birthDate, b.birthDate), 0.55, 1, params.birthDate));
  fields.push(scoreField('gender', a.gender, b.gender, a.gender && b.gender && a.gender === b.gender ? 1 : 0, 1, 1, params.gender));

  const pa = normalizePhone(a.phone);
  const pb = normalizePhone(b.phone);
  fields.push(scoreField('phone', pa || undefined, pb || undefined, pa && pa === pb ? 1 : pa.slice(-7) === pb.slice(-7) && pa ? 0.7 : 0, 0.65, 1, params.phone));

  const aa = digits(a.abha);
  const ab = digits(b.abha);
  fields.push(scoreField('abha', aa || undefined, ab || undefined, aa && aa === ab ? 1 : 0, 1, 1, params.abha));

  fields.push(scoreField('postalCode', a.postalCode, b.postalCode, a.postalCode === b.postalCode ? 1 : 0, 1, 1, params.postalCode));
  fields.push(
    scoreField('city', a.city, b.city, a.city && b.city ? jaroWinkler(normalizeName(a.city), normalizeName(b.city)) : 0, 0.88, 0.95, params.city),
  );
  const ta = tokenSet(a.addressLine);
  const tb = tokenSet(b.addressLine);
  fields.push(
    scoreField('address', ta.size ? [...ta].join(' ') : undefined, tb.size ? [...tb].join(' ') : undefined, jaccard(ta, tb), 0.25, 0.6, params.address),
  );

  const score = fields.reduce((s, f) => s + f.weight, 0);
  const maxScore = fields.filter((f) => f.comparison !== 'missing').reduce((s, f) => s + agreeWeight(params[f.field]), 0);
  // An ABHA number disagreement between two verified identifiers rules out a match.
  const abhaConflict = fields.find((f) => f.field === 'abha')?.comparison === 'disagree';
  const classification: MatchClass = abhaConflict
    ? score >= THRESHOLDS.possible
      ? 'possible'
      : 'no-match'
    : score >= THRESHOLDS.match
      ? 'match'
      : score >= THRESHOLDS.possible
        ? 'possible'
        : 'no-match';
  return { aId: a.id, bId: b.id, score: Math.round(score * 100) / 100, classification, fields, maxScore: Math.round(maxScore * 100) / 100 };
}

/** Blocking keys reduce O(n²) comparisons: candidates must share at least one key. */
export function blockingKeys(r: MpiRecord): string[] {
  const keys: string[] = [];
  const fam = phoneticFold(r.family);
  const giv = phoneticFold(r.given);
  if (fam) keys.push(`sx:${soundex(fam)}`);
  if (giv) keys.push(`sxg:${soundex(giv)}`);
  if (r.birthDate) keys.push(`dob:${r.birthDate}`, `ym:${r.birthDate.slice(0, 7)}`);
  const p = normalizePhone(r.phone);
  if (p) keys.push(`ph:${p}`);
  const ab = digits(r.abha);
  if (ab) keys.push(`abha:${ab}`);
  return keys;
}

/** Score `probe` against a population and return candidates above the possible threshold, best first. */
export function findCandidates(probe: MpiRecord, population: MpiRecord[], limit = 5): MatchResult[] {
  const keys = new Set(blockingKeys(probe));
  return population
    .filter((r) => r.id !== probe.id && blockingKeys(r).some((k) => keys.has(k)))
    .map((r) => compareRecords(probe, r))
    .filter((m) => m.classification !== 'no-match')
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/** All likely duplicate pairs within a population (blocked). */
export function findDuplicatePairs(population: MpiRecord[]): MatchResult[] {
  const blocks = new Map<string, number[]>();
  population.forEach((r, i) => {
    for (const k of blockingKeys(r)) {
      const arr = blocks.get(k) ?? [];
      arr.push(i);
      blocks.set(k, arr);
    }
  });
  const seen = new Set<string>();
  const out: MatchResult[] = [];
  for (const idxs of blocks.values()) {
    if (idxs.length > 50) continue; // over-general block (very common surname)
    for (let x = 0; x < idxs.length; x++) {
      for (let y = x + 1; y < idxs.length; y++) {
        const a = population[idxs[x]!]!;
        const b = population[idxs[y]!]!;
        const pairKey = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`;
        if (seen.has(pairKey)) continue;
        seen.add(pairKey);
        const m = compareRecords(a, b);
        if (m.classification !== 'no-match') out.push(m);
      }
    }
  }
  return out.sort((a, b) => b.score - a.score);
}
