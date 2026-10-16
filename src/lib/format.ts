import { differenceInYears, format, formatDistanceToNowStrict, isValid, parseISO } from 'date-fns';

export function toDate(value: string | Date | undefined | null): Date | null {
  if (!value) return null;
  const d = typeof value === 'string' ? parseISO(value) : value;
  return isValid(d) ? d : null;
}

export function fmtDate(value: string | Date | undefined | null, pattern = 'dd MMM yyyy'): string {
  const d = toDate(value);
  return d ? format(d, pattern) : '—';
}

export function fmtDateTime(value: string | Date | undefined | null): string {
  return fmtDate(value, 'dd MMM yyyy, HH:mm');
}

export function fmtRelative(value: string | Date | undefined | null): string {
  const d = toDate(value);
  if (!d) return '—';
  return d.getTime() > Date.now() ? `in ${formatDistanceToNowStrict(d)}` : `${formatDistanceToNowStrict(d)} ago`;
}

export function ageFrom(birthDate: string | undefined, at: Date = new Date()): number | null {
  const d = toDate(birthDate);
  return d ? differenceInYears(at, d) : null;
}

export function fmtNumber(n: number | null | undefined, digits = 0): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return n.toLocaleString('en-IN', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function fmtPercent(p: number | null | undefined, digits = 0): string {
  if (p === null || p === undefined || Number.isNaN(p)) return '—';
  return `${(p * 100).toFixed(digits)}%`;
}

export function fmtINR(n: number): string {
  return n.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
}

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
}

export function maskPhone(phone: string | undefined): string {
  if (!phone) return '—';
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 4 ? `•••• ${digits.slice(-4)}` : phone;
}

export function formatAbha(n: string | undefined): string {
  if (!n) return '—';
  const d = n.replace(/\D/g, '');
  return d.length === 14 ? `${d.slice(0, 2)}-${d.slice(2, 6)}-${d.slice(6, 10)}-${d.slice(10)}` : n;
}

export const isoNow = (): string => new Date().toISOString();

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
