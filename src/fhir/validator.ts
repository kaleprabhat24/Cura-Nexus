/**
 * Structural validator against simplified Cura Nexus profiles of FHIR R4 resources.
 * Checks required elements, cardinality, value sets, reference syntax, code systems and
 * physiological plausibility. Errors make a resource non-conformant; warnings lower its
 * data-quality score.
 */
import { KNOWN_SYSTEMS, OBS_BY_LOINC, SYS } from './codes';
import type { CodeableConcept, FhirResource, Reference } from './types';
import { RESOURCE_TYPES } from './types';

export interface ValidationIssue {
  severity: 'error' | 'warning';
  path: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
  /** 0–100: 100 minus 50 per error and 10 per warning (floored at 0). */
  score: number;
}

const ID_RE = /^[A-Za-z0-9\-.]{1,64}$/;
const DATE_RE = /^\d{4}(-\d{2}(-\d{2})?)?$/;
const DATETIME_RE = /^\d{4}(-\d{2}(-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?)?)?)?$/;
const REF_RE = /^([A-Z][A-Za-z]+\/[A-Za-z0-9\-.]{1,64}(\/_history\/[A-Za-z0-9\-.]+)?|urn:uuid:[0-9a-f-]{36}|https?:\/\/\S+|#\S+)$/;

class Ctx {
  issues: ValidationIssue[] = [];
  error(path: string, message: string) {
    this.issues.push({ severity: 'error', path, message });
  }
  warn(path: string, message: string) {
    this.issues.push({ severity: 'warning', path, message });
  }
  required(value: unknown, path: string, label = path) {
    if (value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0)) {
      this.error(path, `${label} is required (min cardinality 1)`);
      return false;
    }
    return true;
  }
  oneOf(value: string | undefined, allowed: readonly string[], path: string) {
    if (value !== undefined && !allowed.includes(value)) this.error(path, `"${value}" is not in the value set (${allowed.join(', ')})`);
  }
  dateTime(value: string | undefined, path: string, notFuture = false) {
    if (value === undefined) return;
    if (!DATETIME_RE.test(value) || Number.isNaN(new Date(value).getTime())) this.error(path, `"${value}" is not a valid FHIR dateTime`);
    else if (notFuture && new Date(value).getTime() > Date.now() + 24 * 3600 * 1000) this.error(path, 'Date is in the future');
  }
  date(value: string | undefined, path: string, notFuture = false) {
    if (value === undefined) return;
    if (!DATE_RE.test(value)) this.error(path, `"${value}" is not a valid FHIR date`);
    else if (notFuture && new Date(value).getTime() > Date.now()) this.error(path, 'Date is in the future');
  }
  reference(ref: Reference | undefined, path: string, expectedType?: string) {
    if (!ref) return;
    if (!ref.reference && !ref.identifier && !ref.display) {
      this.error(path, 'Reference must contain reference, identifier or display');
      return;
    }
    if (ref.reference && !REF_RE.test(ref.reference)) this.error(`${path}.reference`, `"${ref.reference}" is not a valid reference`);
    if (expectedType && ref.reference && /^[A-Z]/.test(ref.reference) && !ref.reference.startsWith(`${expectedType}/`)) {
      this.error(`${path}.reference`, `Expected a reference to ${expectedType}`);
    }
  }
  concept(cc: CodeableConcept | undefined, path: string, preferred?: string[]) {
    if (!cc) return;
    if (!cc.coding?.length && !cc.text) {
      this.error(path, 'CodeableConcept needs at least one coding or text');
      return;
    }
    cc.coding?.forEach((c, i) => {
      if (!c.code) this.error(`${path}.coding[${i}].code`, 'Coding without a code');
      if (!c.system) this.warn(`${path}.coding[${i}].system`, 'Coding without a system');
      else if (!KNOWN_SYSTEMS.has(c.system as never) && !c.system.startsWith('http://terminology.hl7.org/') && !c.system.startsWith('urn:')) {
        this.warn(`${path}.coding[${i}].system`, `Unrecognised code system ${c.system}`);
      }
    });
    if (preferred && cc.coding?.length && !cc.coding.some((c) => c.system && preferred.includes(c.system))) {
      this.warn(path, `No coding from a preferred system (${preferred.map(shortSystem).join(' / ')})`);
    }
  }
}

export function shortSystem(system: string): string {
  if (system === SYS.loinc) return 'LOINC';
  if (system === SYS.snomed) return 'SNOMED CT';
  if (system === SYS.icd10) return 'ICD-10';
  if (system === SYS.rxnorm) return 'RxNorm';
  return system.split('/').pop() ?? system;
}

export function validateResource(input: unknown): ValidationResult {
  const ctx = new Ctx();
  if (!input || typeof input !== 'object') {
    ctx.error('', 'Resource must be a JSON object');
    return finish(ctx);
  }
  const r = input as FhirResource;
  if (!r.resourceType) {
    ctx.error('resourceType', 'resourceType is required');
    return finish(ctx);
  }
  if (!RESOURCE_TYPES.includes(r.resourceType)) {
    ctx.error('resourceType', `Unsupported resourceType "${String(r.resourceType)}"`);
    return finish(ctx);
  }
  if (r.id !== undefined && !ID_RE.test(r.id)) ctx.error('id', `"${r.id}" is not a valid FHIR id`);
  if (r.meta?.lastUpdated) ctx.dateTime(r.meta.lastUpdated, 'meta.lastUpdated');

  switch (r.resourceType) {
    case 'Patient': {
      if (!r.identifier?.length) ctx.warn('identifier', 'Patient has no identifier (MRN recommended)');
      r.identifier?.forEach((id, i) => {
        if (!id.value) ctx.error(`identifier[${i}].value`, 'Identifier without a value');
        if (id.system === SYS.abha && id.value && !/^\d{14}$/.test(id.value.replace(/-/g, ''))) {
          ctx.error(`identifier[${i}].value`, 'ABHA number must have 14 digits');
        }
      });
      if (ctx.required(r.name, 'name', 'Patient name')) {
        r.name!.forEach((n, i) => {
          if (!n.family && !n.text && !n.given?.length) ctx.error(`name[${i}]`, 'Name needs family, given or text');
        });
      }
      if (r.gender === undefined) ctx.warn('gender', 'Administrative gender is missing');
      ctx.oneOf(r.gender, ['male', 'female', 'other', 'unknown'], 'gender');
      if (r.birthDate === undefined) ctx.warn('birthDate', 'Birth date is missing');
      ctx.date(r.birthDate, 'birthDate', true);
      r.telecom?.forEach((t, i) => {
        if (t.system === 'phone' && t.value && !/^\+?[\d\s-]{8,16}$/.test(t.value)) ctx.warn(`telecom[${i}].value`, 'Phone number format looks invalid');
        if (t.system === 'email' && t.value && !/^\S+@\S+\.\S+$/.test(t.value)) ctx.warn(`telecom[${i}].value`, 'Email format looks invalid');
      });
      if (!r.address?.length) ctx.warn('address', 'Address is missing');
      r.link?.forEach((l, i) => ctx.reference(l.other, `link[${i}].other`, 'Patient'));
      break;
    }
    case 'Practitioner':
      ctx.required(r.name, 'name');
      break;
    case 'Organization':
      if (!r.name && !r.identifier?.length) ctx.error('name', 'Organization needs a name or identifier');
      break;
    case 'Encounter':
      ctx.required(r.status, 'status');
      ctx.oneOf(r.status, ['planned', 'arrived', 'triaged', 'in-progress', 'onleave', 'finished', 'cancelled', 'entered-in-error', 'unknown'], 'status');
      ctx.required(r.class, 'class');
      if (!r.subject) ctx.warn('subject', 'Encounter has no subject');
      ctx.reference(r.subject, 'subject', 'Patient');
      ctx.dateTime(r.period?.start, 'period.start');
      if (r.period?.start && r.period.end && r.period.end < r.period.start) ctx.error('period', 'period.end is before period.start');
      break;
    case 'Observation': {
      ctx.required(r.status, 'status');
      ctx.oneOf(r.status, ['registered', 'preliminary', 'final', 'amended', 'corrected', 'cancelled', 'entered-in-error', 'unknown'], 'status');
      if (ctx.required(r.code, 'code')) ctx.concept(r.code, 'code', [SYS.loinc, SYS.cura, SYS.snomed]);
      if (ctx.required(r.subject, 'subject')) ctx.reference(r.subject, 'subject', 'Patient');
      if (!r.effectiveDateTime) ctx.warn('effective[x]', 'Observation has no effective time');
      ctx.dateTime(r.effectiveDateTime, 'effectiveDateTime', true);
      const hasValue =
        r.valueQuantity !== undefined || r.valueString !== undefined || r.valueCodeableConcept !== undefined || r.valueBoolean !== undefined || (r.component?.length ?? 0) > 0;
      if (!hasValue) ctx.warn('value[x]', 'Observation has neither a value nor components');
      if (r.valueQuantity) {
        if (typeof r.valueQuantity.value !== 'number' || Number.isNaN(r.valueQuantity.value)) ctx.error('valueQuantity.value', 'Quantity value must be a number');
        if (!r.valueQuantity.unit && !r.valueQuantity.code) ctx.warn('valueQuantity.unit', 'Quantity has no unit');
        if (r.valueQuantity.unit && r.valueQuantity.system !== SYS.ucum) ctx.warn('valueQuantity.system', 'Unit is not coded in UCUM');
        const loinc = r.code?.coding?.find((c) => c.system === SYS.loinc)?.code;
        const def = loinc ? OBS_BY_LOINC[loinc] : undefined;
        const v = r.valueQuantity.value;
        if (def && typeof v === 'number' && (v < def.plausible[0] || v > def.plausible[1])) {
          ctx.warn('valueQuantity.value', `${v} ${def.unit} is outside the plausible range ${def.plausible[0]}–${def.plausible[1]} for ${def.short}`);
        }
      }
      r.component?.forEach((c, i) => {
        ctx.concept(c.code, `component[${i}].code`);
        const loinc = c.code.coding?.find((x) => x.system === SYS.loinc)?.code;
        const def = loinc ? OBS_BY_LOINC[loinc] : undefined;
        const v = c.valueQuantity?.value;
        if (def && typeof v === 'number' && (v < def.plausible[0] || v > def.plausible[1])) {
          ctx.warn(`component[${i}].valueQuantity.value`, `${v} ${def.unit} is outside the plausible range for ${def.short}`);
        }
      });
      break;
    }
    case 'Condition':
      if (ctx.required(r.subject, 'subject')) ctx.reference(r.subject, 'subject', 'Patient');
      if (!r.code) ctx.warn('code', 'Condition has no code');
      ctx.concept(r.code, 'code', [SYS.snomed, SYS.icd10]);
      if (!r.clinicalStatus && r.verificationStatus?.coding?.[0]?.code !== 'entered-in-error') ctx.warn('clinicalStatus', 'clinicalStatus should be present (con-3)');
      ctx.dateTime(r.onsetDateTime, 'onsetDateTime', true);
      break;
    case 'MedicationRequest':
      ctx.required(r.status, 'status');
      ctx.required(r.intent, 'intent');
      if (ctx.required(r.subject, 'subject')) ctx.reference(r.subject, 'subject', 'Patient');
      if (ctx.required(r.medicationCodeableConcept, 'medication[x]')) ctx.concept(r.medicationCodeableConcept, 'medicationCodeableConcept', [SYS.rxnorm]);
      if (!r.dosageInstruction?.length) ctx.warn('dosageInstruction', 'No dosage instruction');
      ctx.dateTime(r.authoredOn, 'authoredOn');
      break;
    case 'AllergyIntolerance':
      if (ctx.required(r.patient, 'patient')) ctx.reference(r.patient, 'patient', 'Patient');
      if (!r.code) ctx.warn('code', 'Allergy has no substance code');
      ctx.concept(r.code, 'code', [SYS.snomed, SYS.rxnorm]);
      ctx.oneOf(r.criticality, ['low', 'high', 'unable-to-assess'], 'criticality');
      break;
    case 'DiagnosticReport':
      ctx.required(r.status, 'status');
      if (ctx.required(r.code, 'code')) ctx.concept(r.code, 'code', [SYS.loinc]);
      ctx.reference(r.subject, 'subject', 'Patient');
      r.result?.forEach((ref, i) => ctx.reference(ref, `result[${i}]`, 'Observation'));
      r.imagingStudy?.forEach((ref, i) => ctx.reference(ref, `imagingStudy[${i}]`, 'ImagingStudy'));
      break;
    case 'ImagingStudy':
      ctx.required(r.status, 'status');
      if (ctx.required(r.subject, 'subject')) ctx.reference(r.subject, 'subject', 'Patient');
      ctx.dateTime(r.started, 'started');
      break;
    case 'RiskAssessment':
      ctx.required(r.status, 'status');
      if (ctx.required(r.subject, 'subject')) ctx.reference(r.subject, 'subject', 'Patient');
      r.prediction?.forEach((p, i) => {
        if (p.probabilityDecimal !== undefined && (p.probabilityDecimal < 0 || p.probabilityDecimal > 1)) {
          ctx.error(`prediction[${i}].probabilityDecimal`, 'Probability must be between 0 and 1 (ras-2)');
        }
      });
      if (!r.prediction?.length) ctx.warn('prediction', 'RiskAssessment has no prediction');
      break;
    case 'Flag':
      ctx.required(r.status, 'status');
      ctx.required(r.code, 'code');
      if (ctx.required(r.subject, 'subject')) ctx.reference(r.subject, 'subject');
      break;
    case 'Task':
      ctx.required(r.status, 'status');
      ctx.required(r.intent, 'intent');
      ctx.reference(r.for, 'for', 'Patient');
      ctx.reference(r.focus, 'focus');
      break;
    case 'Communication':
      ctx.required(r.status, 'status');
      ctx.reference(r.subject, 'subject', 'Patient');
      ctx.dateTime(r.sent, 'sent');
      break;
    case 'Appointment':
      ctx.required(r.status, 'status');
      ctx.required(r.participant, 'participant');
      if (r.start && r.end && r.end < r.start) ctx.error('end', 'end is before start');
      break;
    case 'Consent':
      ctx.required(r.status, 'status');
      ctx.required(r.scope, 'scope');
      ctx.required(r.category, 'category');
      if (ctx.required(r.patient, 'patient')) ctx.reference(r.patient, 'patient', 'Patient');
      if (!r.provision) ctx.warn('provision', 'Consent has no provision — it will deny by default');
      if (r.provision?.period?.start && r.provision.period.end && r.provision.period.end < r.provision.period.start) {
        ctx.error('provision.period', 'period.end is before period.start');
      }
      break;
    case 'Provenance':
      ctx.required(r.target, 'target');
      ctx.required(r.recorded, 'recorded');
      ctx.dateTime(r.recorded, 'recorded');
      ctx.required(r.agent, 'agent');
      r.target?.forEach((t, i) => ctx.reference(t, `target[${i}]`));
      break;
    case 'AuditEvent':
      ctx.required(r.type, 'type');
      ctx.required(r.recorded, 'recorded');
      ctx.required(r.agent, 'agent');
      ctx.required(r.source?.observer, 'source.observer');
      break;
    case 'DocumentReference':
      ctx.required(r.status, 'status');
      if (ctx.required(r.content, 'content')) {
        r.content.forEach((c, i) => {
          if (!c.attachment?.data && !c.attachment?.url) ctx.error(`content[${i}].attachment`, 'Attachment needs data or url');
        });
      }
      ctx.reference(r.subject, 'subject', 'Patient');
      break;
    case 'Device':
      break;
  }
  return finish(ctx);
}

function finish(ctx: Ctx): ValidationResult {
  const errors = ctx.issues.filter((i) => i.severity === 'error').length;
  const warnings = ctx.issues.length - errors;
  return { valid: errors === 0, issues: ctx.issues, score: Math.max(0, 100 - errors * 50 - warnings * 10) };
}

export interface QualityReport {
  score: number;
  resources: number;
  valid: number;
  errors: number;
  warnings: number;
  byType: Record<string, { count: number; errors: number; warnings: number }>;
  worst: { ref: string; result: ValidationResult }[];
}

/** Aggregate validation across a patient's record into a data-quality score. */
export function qualityReport(resources: FhirResource[]): QualityReport {
  const byType: QualityReport['byType'] = {};
  let scoreSum = 0;
  let valid = 0;
  let errors = 0;
  let warnings = 0;
  const all: { ref: string; result: ValidationResult }[] = [];
  for (const r of resources) {
    const result = validateResource(r);
    const e = result.issues.filter((i) => i.severity === 'error').length;
    const w = result.issues.length - e;
    const t = (byType[r.resourceType] ??= { count: 0, errors: 0, warnings: 0 });
    t.count++;
    t.errors += e;
    t.warnings += w;
    errors += e;
    warnings += w;
    if (result.valid) valid++;
    scoreSum += result.score;
    if (result.issues.length) all.push({ ref: `${r.resourceType}/${r.id}`, result });
  }
  all.sort((a, b) => a.result.score - b.result.score);
  return {
    score: resources.length ? Math.round(scoreSum / resources.length) : 100,
    resources: resources.length,
    valid,
    errors,
    warnings,
    byType,
    worst: all.slice(0, 25),
  };
}
