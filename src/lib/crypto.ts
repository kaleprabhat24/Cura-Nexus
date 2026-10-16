/**
 * Password hashing with PBKDF2-SHA-256 via Web Crypto (available in browsers and Node 18+).
 * Each user gets a random 16-byte salt; the derived 256-bit key is stored hex-encoded.
 */
export const PBKDF2_ITERATIONS = 120_000;

const enc = new TextEncoder();

function subtle(): SubtleCrypto {
  const c = globalThis.crypto;
  if (!c?.subtle) throw new Error('Web Crypto is not available in this environment');
  return c.subtle;
}

export function toHex(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function fromHex(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function randomBytes(n: number): Uint8Array {
  const out = new Uint8Array(n);
  globalThis.crypto.getRandomValues(out);
  return out;
}

export function randomToken(bytes = 32): string {
  return toHex(randomBytes(bytes));
}

export interface PasswordHash {
  hash: string;
  salt: string;
  iterations: number;
}

export async function hashPassword(
  password: string,
  saltHex: string = toHex(randomBytes(16)),
  iterations: number = PBKDF2_ITERATIONS,
): Promise<PasswordHash> {
  const key = await subtle().importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await subtle().deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: fromHex(saltHex), iterations },
    key,
    256,
  );
  return { hash: toHex(bits), salt: saltHex, iterations };
}

/** Constant-time comparison of two equal-length hex strings. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifyPassword(password: string, stored: PasswordHash): Promise<boolean> {
  const { hash } = await hashPassword(password, stored.salt, stored.iterations);
  return safeEqual(hash, stored.hash);
}

export async function sha256Hex(text: string): Promise<string> {
  return toHex(await subtle().digest('SHA-256', enc.encode(text)));
}
