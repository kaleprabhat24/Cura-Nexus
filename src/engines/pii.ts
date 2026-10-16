/**
 * PII redaction for free text (chat input, logs, LLM prompts).
 * Patterns cover Indian identifiers: Aadhaar (12 digits), ABHA number (14 digits),
 * ABHA address, PAN, Indian mobile numbers, emails and explicit dates of birth.
 */

export interface Redaction {
  type: string;
  original: string;
}

const PATTERNS: { type: string; re: RegExp }[] = [
  { type: 'EMAIL', re: /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g },
  { type: 'ABHA_ADDRESS', re: /\b[a-z0-9._]{3,32}@(abdm|sbx|ndhm)\b/gi },
  { type: 'ABHA', re: /\b\d{2}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g },
  { type: 'AADHAAR', re: /\b[2-9]\d{3}[-\s]?\d{4}[-\s]?\d{4}\b/g },
  { type: 'PAN', re: /\b[A-Z]{5}\d{4}[A-Z]\b/g },
  { type: 'PHONE', re: /(?:\+91[-\s]?)?\b[6-9]\d{4}[-\s]?\d{5}\b/g },
  { type: 'MRN', re: /\bCN-\d{6}\b/g },
  { type: 'DOB', re: /\b(?:dob|born on|date of birth)[:\s]+\d{1,4}[/.-]\d{1,2}[/.-]\d{1,4}\b/gi },
];

export function redactPii(text: string): { text: string; redactions: Redaction[] } {
  const redactions: Redaction[] = [];
  let out = text;
  for (const { type, re } of PATTERNS) {
    out = out.replace(re, (m) => {
      redactions.push({ type, original: m });
      return `[${type}]`;
    });
  }
  return { text: out, redactions };
}

export function containsPii(text: string): boolean {
  return redactPii(text).redactions.length > 0;
}
