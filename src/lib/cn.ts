import clsx, { type ClassValue } from 'clsx';

/** Compose Tailwind class names conditionally. */
export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}
