/**
 * FHIR REST search over in-memory resources (pure, framework-free).
 * Supported parameters: _id, patient/subject, code, date (eq/ne/gt/lt/ge/le prefixes), status,
 * category, identifier, name, gender, birthdate, _lastUpdated, _sort, _count, _offset.
 */
import type { Bundle, CodeableConcept, FhirResource, Identifier, Reference } from './types';

export type SearchParams = Record<string, string | string[]>;

export const SUPPORTED_PARAMS = [
  '_id',
  'patient',
  'subject',
  'code',
  'date',
  'status',
  'category',
  'identifier',
  'name',
  'gender',
  'birthdate',
  '_lastUpdated',
  '_sort',
  '_count',
  '_offset',
] as const;

export class SearchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SearchError';
  }
}

/** Parse `Observation?patient=1&code=4548-4` (or just the query) into type + params. */
export function parseSearchUrl(input: string): { resourceType: string; params: SearchParams; id?: string; operation?: string } {
  const trimmed = input.trim().replace(/^\/+/, '').replace(/^(https?:\/\/[^/]+\/)?(fhir\/)?/i, '');
  const [path = '', query = ''] = trimmed.split('?');
  const segments = path.split('/').filter(Boolean);
  const resourceType = segments[0] ?? '';
  const params: SearchParams = {};
  for (const part of query.split('&').filter(Boolean)) {
    const idx = part.indexOf('=');
    const key = decodeURIComponent(idx >= 0 ? part.slice(0, idx) : part);
    const value = decodeURIComponent(idx >= 0 ? part.slice(idx + 1) : '');
    const existing = params[key];
    if (existing === undefined) params[key] = value;
    else params[key] = Array.isArray(existing) ? [...existing, value] : [existing, value];
  }
  const second = segments[1];
  if (second?.startsWith('$')) return { resourceType, params, operation: second };
  const third = segments[2];
  if (second && third?.startsWith('$')) return { resourceType, params, id: second, operation: third };
  return { resourceType, params, id: second };
}

const asArray = (v: string | string[] | undefined): string[] => (v === undefined ? [] : Array.isArray(v) ? v : [v]);

function refId(ref: Reference | undefined): string | undefined {
  return ref?.reference?.split('/').pop();
}

/** The patient a resource belongs to, if any. */
export function patientRefOf(r: FhirResource): string | undefined {
  switch (r.resourceType) {
    case 'Patient':
      return r.id;
    case 'AllergyIntolerance':
      return refId(r.patient);
    case 'Consent':
      return refId(r.patient);
    case 'Task':
      return refId(r.for);
    case 'Appointment': {
      const p = r.participant.find((x) => x.actor?.reference?.startsWith('Patient/'));
      return refId(p?.actor);
    }
    case 'Provenance': {
      const t = r.target.find((x) => x.reference?.startsWith('Patient/'));
      return refId(t);
    }
    case 'AuditEvent': {
      const e = r.entity?.find((x) => x.what?.reference?.startsWith('Patient/'));
      return refId(e?.what);
    }
    case 'Practitioner':
    case 'Organization':
    case 'Device':
      return undefined;
    default: {
      const subject = (r as { subject?: Reference }).subject;
      return subject?.reference?.startsWith('Patient/') ? refId(subject) : undefined;
    }
  }
}

/** The clinically relevant date of a resource (used by `date` and `_sort=date`). */
export function dateOf(r: FhirResource): string | undefined {
  switch (r.resourceType) {
    case 'Observation':
      return r.effectiveDateTime ?? r.issued;
    case 'Condition':
      return r.onsetDateTime ?? r.recordedDate;
    case 'MedicationRequest':
      return r.authoredOn;
    case 'Encounter':
      return r.period?.start;
    case 'DiagnosticReport':
      return r.effectiveDateTime ?? r.issued;
    case 'ImagingStudy':
      return r.started;
    case 'RiskAssessment':
      return r.occurrenceDateTime;
    case 'Flag':
      return r.period?.start;
    case 'Task':
      return r.authoredOn;
    case 'Communication':
      return r.sent;
    case 'Appointment':
      return r.start;
    case 'Consent':
      return r.dateTime;
    case 'Provenance':
      return r.recorded;
    case 'AuditEvent':
      return r.recorded;
    case 'DocumentReference':
      return r.date;
    case 'AllergyIntolerance':
      return r.recordedDate;
    case 'Patient':
      return r.birthDate;
    default:
      return r.meta?.lastUpdated;
  }
}

function codeConceptsOf(r: FhirResource): CodeableConcept[] {
  switch (r.resourceType) {
    case 'Observation':
    case 'DiagnosticReport':
    case 'Flag':
      return [r.code];
    case 'Condition':
    case 'AllergyIntolerance':
    case 'RiskAssessment':
    case 'Task':
      return r.code ? [r.code] : [];
    case 'MedicationRequest':
      return r.medicationCodeableConcept ? [r.medicationCodeableConcept] : [];
    case 'Encounter':
      return r.type ?? [];
    case 'DocumentReference':
      return r.type ? [r.type] : [];
    case 'ImagingStudy':
      return r.procedureCode ?? [];
    default:
      return [];
  }
}

function categoriesOf(r: FhirResource): CodeableConcept[] {
  const cat = (r as { category?: CodeableConcept[] | string[] }).category;
  if (!cat) return [];
  return (cat as unknown[]).map((c) => (typeof c === 'string' ? { coding: [{ code: c }] } : (c as CodeableConcept)));
}

function statusOf(r: FhirResource): string | undefined {
  if (r.resourceType === 'Condition') return r.clinicalStatus?.coding?.[0]?.code;
  if (r.resourceType === 'AllergyIntolerance') return r.clinicalStatus?.coding?.[0]?.code;
  if (r.resourceType === 'Patient') return r.active === false ? 'inactive' : 'active';
  return (r as { status?: string }).status;
}

function matchToken(concepts: CodeableConcept[], token: string): boolean {
  return token.split(',').some((t) => {
    const [system, code] = t.includes('|') ? (t.split('|') as [string, string]) : [undefined, t];
    return concepts.some((cc) =>
      (cc.coding ?? []).some((c) => (system ? c.system === system : true) && (code ? c.code === code : true)),
    );
  });
}

const PREFIXES = ['eq', 'ne', 'gt', 'lt', 'ge', 'le', 'sa', 'eb'] as const;

/** Compare a resource date against a FHIR date search value (precision-aware). */
export function matchDate(value: string | undefined, expr: string): boolean {
  if (!value) return false;
  const prefix = PREFIXES.find((p) => expr.startsWith(p) && /\d/.test(expr.charAt(2))) ?? 'eq';
  const target = prefix === 'eq' && !expr.startsWith('eq') ? expr : expr.slice(2);
  if (!/^\d{4}(-\d{2}(-\d{2}(T.*)?)?)?$/.test(target)) throw new SearchError(`Invalid date value "${expr}"`);
  // Build the [start, end) interval implied by the target's precision.
  const start = new Date(target.length === 4 ? `${target}-01-01` : target.length === 7 ? `${target}-01` : target);
  const end = new Date(start);
  if (target.length === 4) end.setUTCFullYear(end.getUTCFullYear() + 1);
  else if (target.length === 7) end.setUTCMonth(end.getUTCMonth() + 1);
  else if (target.length === 10) end.setUTCDate(end.getUTCDate() + 1);
  else end.setTime(end.getTime() + 1000);
  const v = new Date(value.length === 10 ? `${value}T00:00:00Z` : value).getTime();
  const s = start.getTime();
  const e = end.getTime();
  switch (prefix) {
    case 'eq':
      return v >= s && v < e;
    case 'ne':
      return v < s || v >= e;
    case 'gt':
    case 'sa':
      return v >= e;
    case 'lt':
    case 'eb':
      return v < s;
    case 'ge':
      return v >= s;
    case 'le':
      return v < e;
  }
}

function identifiersOf(r: FhirResource): Identifier[] {
  return ((r as { identifier?: Identifier[] | Identifier }).identifier
    ? ([] as Identifier[]).concat((r as { identifier: Identifier[] | Identifier }).identifier)
    : []) as Identifier[];
}

function nameText(r: FhirResource): string {
  if (r.resourceType !== 'Patient' && r.resourceType !== 'Practitioner') return (r as { name?: string }).name ?? '';
  return (r.name ?? []).map((n) => [n.text, ...(n.given ?? []), n.family].filter(Boolean).join(' ')).join(' ');
}

export function matches(r: FhirResource, params: SearchParams): boolean {
  for (const [key, raw] of Object.entries(params)) {
    if (key.startsWith('_') && key !== '_id' && key !== '_lastUpdated') continue;
    for (const value of asArray(raw)) {
      if (value === '') continue;
      switch (key) {
        case '_id':
          if (!value.split(',').includes(r.id ?? '')) return false;
          break;
        case 'patient':
        case 'subject': {
          const id = value.replace(/^Patient\//, '');
          if (patientRefOf(r) !== id) return false;
          break;
        }
        case 'code':
          if (!matchToken(codeConceptsOf(r), value)) return false;
          break;
        case 'category':
          if (!matchToken(categoriesOf(r), value)) return false;
          break;
        case 'status':
          if (!value.split(',').includes(statusOf(r) ?? '')) return false;
          break;
        case 'date':
          if (!matchDate(dateOf(r), value)) return false;
          break;
        case 'birthdate':
          if (r.resourceType !== 'Patient' || !matchDate(r.birthDate, value)) return false;
          break;
        case '_lastUpdated':
          if (!matchDate(r.meta?.lastUpdated, value)) return false;
          break;
        case 'gender':
          if (r.resourceType !== 'Patient' || r.gender !== value) return false;
          break;
        case 'name':
          if (!nameText(r).toLowerCase().includes(value.toLowerCase())) return false;
          break;
        case 'identifier': {
          const [system, val] = value.includes('|') ? (value.split('|') as [string, string]) : [undefined, value];
          const ok = identifiersOf(r).some((i) => (system ? i.system === system : true) && (val ? i.value === val : true));
          if (!ok) return false;
          break;
        }
        default:
          throw new SearchError(`Unsupported search parameter "${key}". Supported: ${SUPPORTED_PARAMS.join(', ')}`);
      }
    }
  }
  return true;
}

function sortKey(r: FhirResource, field: string): string {
  if (field === 'date') return dateOf(r) ?? '';
  if (field === '_lastUpdated') return r.meta?.lastUpdated ?? '';
  if (field === 'name') return nameText(r).toLowerCase();
  if (field === '_id') return r.id ?? '';
  if (field === 'status') return statusOf(r) ?? '';
  if (field === 'birthdate' && r.resourceType === 'Patient') return r.birthDate ?? '';
  throw new SearchError(`Unsupported _sort field "${field}"`);
}

export interface SearchResult<R extends FhirResource = FhirResource> {
  total: number;
  resources: R[];
}

export function search<R extends FhirResource = FhirResource>(resources: R[], params: SearchParams = {}): SearchResult<R> {
  const filtered = resources.filter((r) => matches(r, params));
  const sortSpec = asArray(params._sort).join(',');
  if (sortSpec) {
    const fields = sortSpec.split(',').filter(Boolean);
    filtered.sort((a, b) => {
      for (const f of fields) {
        const desc = f.startsWith('-');
        const name = desc ? f.slice(1) : f;
        const av = sortKey(a, name);
        const bv = sortKey(b, name);
        if (av !== bv) return (av < bv ? -1 : 1) * (desc ? -1 : 1);
      }
      return 0;
    });
  }
  const count = params._count !== undefined ? Number(asArray(params._count)[0]) : undefined;
  const offset = params._offset !== undefined ? Number(asArray(params._offset)[0]) : 0;
  if (count !== undefined && (!Number.isFinite(count) || count < 0)) throw new SearchError('_count must be a non-negative integer');
  const page = filtered.slice(offset, count !== undefined ? offset + count : undefined);
  return { total: filtered.length, resources: page };
}

export function toSearchBundle<R extends FhirResource>(result: SearchResult<R>, selfUrl: string): Bundle<R> {
  return {
    resourceType: 'Bundle',
    type: 'searchset',
    timestamp: new Date().toISOString(),
    total: result.total,
    link: [{ relation: 'self', url: selfUrl }],
    entry: result.resources.map((r) => ({ fullUrl: `${r.resourceType}/${r.id}`, resource: r, search: { mode: 'match' } })),
  };
}
