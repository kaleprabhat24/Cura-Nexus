/** Structural JSON diff for FHIR version comparison. */
export interface DiffEntry {
  path: string;
  op: 'add' | 'remove' | 'replace';
  before?: unknown;
  after?: unknown;
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

export function jsonDiff(before: unknown, after: unknown, path = ''): DiffEntry[] {
  if (before === after) return [];
  if (Array.isArray(before) && Array.isArray(after)) {
    const out: DiffEntry[] = [];
    const n = Math.max(before.length, after.length);
    for (let i = 0; i < n; i++) {
      const p = `${path}[${i}]`;
      if (i >= before.length) out.push({ path: p, op: 'add', after: after[i] });
      else if (i >= after.length) out.push({ path: p, op: 'remove', before: before[i] });
      else out.push(...jsonDiff(before[i], after[i], p));
    }
    return out;
  }
  if (isObj(before) && isObj(after)) {
    const out: DiffEntry[] = [];
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    for (const k of [...keys].sort()) {
      const p = path ? `${path}.${k}` : k;
      if (!(k in before)) out.push({ path: p, op: 'add', after: after[k] });
      else if (!(k in after)) out.push({ path: p, op: 'remove', before: before[k] });
      else out.push(...jsonDiff(before[k], after[k], p));
    }
    return out;
  }
  return [{ path: path || '(root)', op: 'replace', before, after }];
}
