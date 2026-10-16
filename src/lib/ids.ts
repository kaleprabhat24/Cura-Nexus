/** Identifier helpers. */

export function uid(prefix = ''): string {
  const raw =
    typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID()
      : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
  return prefix ? `${prefix}-${raw}` : raw;
}

/** FNV-1a 32-bit hash — stable across runs, used for idempotent resource ids. */
export function fnv1a(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** A short deterministic id built from parts, valid as a FHIR id ([A-Za-z0-9-.]{1,64}). */
export function stableId(prefix: string, ...parts: (string | number | undefined)[]): string {
  const key = parts.map((p) => String(p ?? '')).join('|');
  return `${prefix}-${fnv1a(key)}${fnv1a(key.split('').reverse().join(''))}`;
}

export function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
}
