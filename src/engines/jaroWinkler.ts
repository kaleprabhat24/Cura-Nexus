/**
 * Jaro and Jaro–Winkler string similarity (Winkler 1990).
 * jaro = (m/|a| + m/|b| + (m − t)/m) / 3, where m = matching characters within the
 * match window ⌊max(|a|,|b|)/2⌋ − 1 and t = half the number of transpositions.
 * jw = jaro + ℓ·p·(1 − jaro) with common-prefix length ℓ ≤ 4 and scaling p = 0.1.
 */
export function jaro(a: string, b: string): number {
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;
  const window = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
  const aMatch = new Array<boolean>(a.length).fill(false);
  const bMatch = new Array<boolean>(b.length).fill(false);
  let matches = 0;
  for (let i = 0; i < a.length; i++) {
    const lo = Math.max(0, i - window);
    const hi = Math.min(i + window + 1, b.length);
    for (let j = lo; j < hi; j++) {
      if (bMatch[j] || a[i] !== b[j]) continue;
      aMatch[i] = true;
      bMatch[j] = true;
      matches++;
      break;
    }
  }
  if (!matches) return 0;
  let t = 0;
  let k = 0;
  for (let i = 0; i < a.length; i++) {
    if (!aMatch[i]) continue;
    while (!bMatch[k]) k++;
    if (a[i] !== b[k]) t++;
    k++;
  }
  t /= 2;
  return (matches / a.length + matches / b.length + (matches - t) / matches) / 3;
}

export function jaroWinkler(a: string, b: string, prefixScale = 0.1): number {
  const j = jaro(a, b);
  let prefix = 0;
  for (let i = 0; i < Math.min(4, a.length, b.length); i++) {
    if (a[i] === b[i]) prefix++;
    else break;
  }
  return j + prefix * prefixScale * (1 - j);
}

/** American Soundex — used as an MPI blocking key. */
export function soundex(input: string): string {
  const s = input.toUpperCase().replace(/[^A-Z]/g, '');
  if (!s) return '';
  const map: Record<string, string> = {
    B: '1', F: '1', P: '1', V: '1',
    C: '2', G: '2', J: '2', K: '2', Q: '2', S: '2', X: '2', Z: '2',
    D: '3', T: '3', L: '4', M: '5', N: '5', R: '6',
  };
  let out = s[0]!;
  let prev = map[s[0]!] ?? '';
  for (let i = 1; i < s.length && out.length < 4; i++) {
    const ch = s[i]!;
    const code = map[ch] ?? '';
    if (code && code !== prev) out += code;
    if (ch !== 'H' && ch !== 'W') prev = code;
  }
  return out.padEnd(4, '0');
}
