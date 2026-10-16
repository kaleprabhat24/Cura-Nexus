/**
 * RFC 4180 CSV parser and header → field auto-mapping.
 * Handles quoted fields, escaped quotes (""), embedded newlines, CRLF and a UTF-8 BOM.
 */

export interface CsvTable {
  headers: string[];
  rows: Record<string, string>[];
}

export function parseCsvRows(text: string, delimiter = ','): string[][] {
  const src = text.replace(/^﻿/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
      continue;
    }
    if (ch === '"' && field === '') inQuotes = true;
    else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
    } else field += ch;
  }
  if (inQuotes) throw new Error('Unterminated quoted field in CSV');
  row.push(field);
  if (row.some((c) => c.trim() !== '')) rows.push(row);
  return rows;
}

export function detectDelimiter(text: string): string {
  const first = text.split(/\r?\n/, 1)[0] ?? '';
  const counts = [',', ';', '\t', '|'].map((d) => [d, first.split(d).length] as const);
  return counts.sort((a, b) => b[1] - a[1])[0]![0];
}

export function parseCsv(text: string): CsvTable {
  const rows = parseCsvRows(text, detectDelimiter(text));
  if (!rows.length) return { headers: [], rows: [] };
  const headers = rows[0]!.map((h, i) => h.trim() || `column_${i + 1}`);
  return {
    headers,
    rows: rows.slice(1).map((r) => Object.fromEntries(headers.map((h, i) => [h, (r[i] ?? '').trim()]))),
  };
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Guess a mapping from CSV headers to target fields using synonym lists.
 * Returns { targetField: header } for every target with a confident match.
 */
export function guessMapping(headers: string[], synonyms: Record<string, string[]>): Record<string, string> {
  const out: Record<string, string> = {};
  const used = new Set<string>();
  for (const [target, syns] of Object.entries(synonyms)) {
    const candidates = [target, ...syns].map(norm);
    const exact = headers.find((h) => !used.has(h) && candidates.includes(norm(h)));
    const partial = exact ?? headers.find((h) => !used.has(h) && candidates.some((c) => c.length > 3 && norm(h).includes(c)));
    if (partial) {
      out[target] = partial;
      used.add(partial);
    }
  }
  return out;
}

export const PATIENT_CSV_FIELDS: Record<string, { label: string; required?: boolean; synonyms: string[] }> = {
  given: { label: 'Given name', required: true, synonyms: ['first_name', 'firstname', 'given_name', 'fname', 'forename'] },
  family: { label: 'Family name', required: true, synonyms: ['last_name', 'lastname', 'surname', 'family_name', 'lname'] },
  fullName: { label: 'Full name (if no split)', synonyms: ['name', 'patient_name', 'full_name'] },
  birthDate: { label: 'Date of birth', required: true, synonyms: ['dob', 'date_of_birth', 'birth_date', 'birthdate', 'dateofbirth'] },
  gender: { label: 'Gender', synonyms: ['sex', 'gender_code'] },
  phone: { label: 'Phone', synonyms: ['mobile', 'phone_number', 'contact', 'mobile_no', 'telephone'] },
  email: { label: 'Email', synonyms: ['email_address', 'mail'] },
  mrn: { label: 'MRN', synonyms: ['mrn', 'medical_record_number', 'hospital_id', 'uhid', 'patient_id'] },
  abha: { label: 'ABHA number', synonyms: ['abha_number', 'abha_no', 'health_id', 'healthid'] },
  addressLine: { label: 'Address line', synonyms: ['address', 'street', 'address_line', 'addr'] },
  city: { label: 'City', synonyms: ['town', 'district'] },
  state: { label: 'State', synonyms: ['state_name', 'province'] },
  postalCode: { label: 'PIN code', synonyms: ['pincode', 'pin', 'zip', 'postal_code', 'postcode'] },
};

export const OBSERVATION_CSV_FIELDS: Record<string, { label: string; required?: boolean; synonyms: string[] }> = {
  patientRef: { label: 'Patient MRN / ABHA', required: true, synonyms: ['mrn', 'patient_id', 'uhid', 'abha', 'patient'] },
  code: { label: 'LOINC code', required: true, synonyms: ['loinc', 'test_code', 'code', 'loinc_code'] },
  value: { label: 'Value', required: true, synonyms: ['result', 'value', 'result_value', 'reading'] },
  unit: { label: 'Unit', synonyms: ['units', 'uom'] },
  date: { label: 'Date / time', required: true, synonyms: ['date', 'collected', 'effective', 'datetime', 'result_date', 'test_date'] },
};

/** Parse common date spellings (ISO, DD/MM/YYYY, DD-MM-YYYY, YYYYMMDD) to YYYY-MM-DD. */
export function normalizeDate(input: string): string | undefined {
  const s = input.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s);
  if (m) return `${m[3]}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}`;
  m = /^(\d{4})(\d{2})(\d{2})$/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return undefined;
}

export function normalizeGender(input: string | undefined): 'male' | 'female' | 'other' | 'unknown' | undefined {
  const s = (input ?? '').trim().toLowerCase();
  if (!s) return undefined;
  if (['m', 'male', 'man', 'boy'].includes(s)) return 'male';
  if (['f', 'female', 'woman', 'girl'].includes(s)) return 'female';
  if (['o', 'other', 't', 'transgender', 'x'].includes(s)) return 'other';
  return 'unknown';
}
