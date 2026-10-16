/**
 * Okapi BM25 lexical retrieval (Robertson & Zaragoza 2009).
 *   score(D, Q) = Σ_q IDF(q) · f(q, D)(k₁ + 1) / (f(q, D) + k₁(1 − b + b·|D|/avgdl))
 *   IDF(q) = ln(1 + (N − n(q) + 0.5) / (n(q) + 0.5))
 * with k₁ = 1.5 and b = 0.75. Tokens are lower-cased, stop-word filtered and lightly
 * stemmed; a small clinical synonym table expands queries (e.g. "sugar" → "glucose").
 */

const STOP = new Set(
  'a an and are as at be but by can do does for from has have how i if in into is it its me my of on or our should so than that the their them then there these they this to was we what when where which who why will with would you your about after before more most not no any also just very please tell explain'.split(
    ' ',
  ),
);

const SYNONYMS: Record<string, string[]> = {
  sugar: ['glucose', 'diabet'],
  bp: ['blood', 'pressur', 'hypertens'],
  kidney: ['renal', 'egfr', 'ckd'],
  renal: ['kidney'],
  heart: ['cardiac', 'cardiovascular'],
  lung: ['pulmonary', 'copd', 'respiratory'],
  liver: ['hepatic', 'fibrosis'],
  breathless: ['dyspnoea', 'dyspnea', 'breath'],
  fat: ['lipid', 'cholesterol'],
  thyroid: ['hypothyroid', 'levothyroxin'],
  medicine: ['drug', 'medic'],
  tablet: ['drug', 'medic'],
  a1c: ['hba1c'],
};

export function stem(t: string): string {
  if (t.length <= 3) return t;
  return t
    .replace(/(ies)$/, 'y')
    .replace(/(ing|edly|ed|es|s|ly)$/, '')
    .replace(/(ation|ational)$/, 'at')
    .replace(/(ness|ment)$/, '')
    .replace(/(e)$/, '');
}

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[₂]/g, '2')
    .split(/[^a-z0-9]+/)
    .filter((t) => t && !STOP.has(t))
    .map(stem);
}

export function expandQuery(tokens: string[]): string[] {
  const out = [...tokens];
  for (const t of tokens) for (const s of SYNONYMS[t] ?? []) out.push(stem(s));
  return out;
}

export interface Bm25Doc {
  id: string;
  title: string;
  text: string;
  source?: string;
}

export interface Bm25Hit<D extends Bm25Doc = Bm25Doc> {
  doc: D;
  score: number;
  matched: string[];
}

export class Bm25Index<D extends Bm25Doc = Bm25Doc> {
  private docs: { doc: D; tf: Map<string, number>; len: number }[] = [];
  private df = new Map<string, number>();
  private avgdl = 0;

  constructor(
    docs: D[],
    private k1 = 1.5,
    private b = 0.75,
  ) {
    for (const doc of docs) {
      // Title terms are counted twice (field boost).
      const tokens = [...tokenize(doc.title), ...tokenize(doc.title), ...tokenize(doc.text)];
      const tf = new Map<string, number>();
      for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
      for (const t of tf.keys()) this.df.set(t, (this.df.get(t) ?? 0) + 1);
      this.docs.push({ doc, tf, len: tokens.length });
    }
    this.avgdl = this.docs.reduce((s, d) => s + d.len, 0) / Math.max(1, this.docs.length);
  }

  get size(): number {
    return this.docs.length;
  }

  idf(term: string): number {
    const n = this.df.get(term) ?? 0;
    const N = this.docs.length;
    return Math.log(1 + (N - n + 0.5) / (n + 0.5));
  }

  search(query: string, k = 5, expand = true): Bm25Hit<D>[] {
    const base = tokenize(query);
    const terms = [...new Set(expand ? expandQuery(base) : base)];
    if (!terms.length) return [];
    const hits: Bm25Hit<D>[] = [];
    for (const d of this.docs) {
      let score = 0;
      const matched: string[] = [];
      for (const t of terms) {
        const f = d.tf.get(t);
        if (!f) continue;
        matched.push(t);
        score += (this.idf(t) * (f * (this.k1 + 1))) / (f + this.k1 * (1 - this.b + (this.b * d.len) / this.avgdl));
      }
      if (score > 0) hits.push({ doc: d.doc, score, matched });
    }
    return hits.sort((a, b) => b.score - a.score).slice(0, k);
  }
}
