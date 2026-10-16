import { useSyncExternalStore } from 'react';
import { audit, getDb, hashPw, update, uid, type Role, type User } from '@/store';

const KEY = 'cura.session';
const subs = new Set<() => void>();
let cache: string | null = null;

function read(): string | null {
  cache = localStorage.getItem(KEY);
  return cache;
}

export function useSession(): User | null {
  const raw = useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    () => cache ?? read(),
  );
  if (!raw) return null;
  try {
    const { email } = JSON.parse(raw) as { email: string };
    return getDb().users.find((u) => u.email === email) ?? null;
  } catch {
    return null;
  }
}

function set(email: string | null) {
  if (email) localStorage.setItem(KEY, JSON.stringify({ email, at: Date.now() }));
  else localStorage.removeItem(KEY);
  read();
  subs.forEach((s) => s());
}

export async function login(email: string, password: string): Promise<string | null> {
  const u = getDb().users.find((x) => x.email === email.trim().toLowerCase());
  if (!u || (await hashPw(password, u.salt)) !== u.hash) return 'Email or password is incorrect.';
  if (u.status !== 'active') return 'Your account is awaiting administrator approval.';
  set(u.email);
  audit('login', `${u.email} signed in`);
  return null;
}

export async function signup(name: string, email: string, password: string, role: Role): Promise<string | null> {
  const e = email.trim().toLowerCase();
  if (getDb().users.some((u) => u.email === e)) return 'An account with this email already exists.';
  if (password.length < 8) return 'Password must be at least 8 characters.';
  const salt = Math.random().toString(36).slice(2);
  const hash = await hashPw(password, salt);
  const status = role === 'patient' ? 'active' : 'pending';
  let patientId: string | undefined;
  update((d) => {
    if (role === 'patient') {
      patientId = uid('pt');
      const [given, ...rest] = name.trim().split(/\s+/);
      d.resources.push({ resourceType: 'Patient', id: patientId, meta: { source: 'Self-registration' }, active: true, name: [{ given: [given ?? name], family: rest.join(' ') }], telecom: [{ system: 'email', value: e }] });
    }
    d.users.push({ id: uid('u'), email: e, name, role, salt, hash, patientId, status });
  });
  audit('signup', `${e} registered as ${role} (${status})`);
  if (status === 'active') set(e);
  return null;
}

export function logout(): void {
  audit('logout', 'Signed out');
  set(null);
}
