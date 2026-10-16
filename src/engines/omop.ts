/**
 * FHIR R4 → OMOP CDM v5.4 mapping for five core tables.
 * Concept ids come from a small embedded subset of the OHDSI standard vocabulary; codes
 * without a mapping get concept_id 0 (the OMOP convention for "no matching concept") and
 * keep their source code in *_source_value.
 */
import { SYS } from '@/fhir/codes';
import type { Condition, Encounter, MedicationRequest, Observation, Patient } from '@/fhir/types';

export const GENDER_CONCEPT: Record<string, number> = { male: 8507, female: 8532 };
export const VISIT_CONCEPT: Record<string, number> = { IMP: 9201, AMB: 9202, EMER: 9203, VR: 5083, HH: 581476 };
export const CONDITION_CONCEPT: Record<string, number> = {
  '44054006': 201826, // Type 2 diabetes mellitus
  '38341003': 316866, // Hypertensive disorder
  '13645005': 255573, // Chronic obstructive lung disease
  '195967001': 317009, // Asthma
  '49436004': 313217, // Atrial fibrillation
  '84114007': 316139, // Heart failure
  '40930008': 140673, // Hypothyroidism
};
export const MEASUREMENT_CONCEPT: Record<string, number> = {
  '4548-4': 3004410,
  '8480-6': 3004249,
  '8462-4': 3012888,
  '8867-4': 3027018,
  '29463-7': 3025315,
  '39156-5': 3038553,
  '2160-0': 3016723,
  '2093-3': 3027114,
  '2085-9': 3007070,
  '59408-5': 40762499,
};

const idNum = (id: string | undefined) => {
  let h = 0;
  for (const ch of id ?? '') h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % 2_000_000_000;
};
const ymd = (s: string | undefined) => (s ? s.slice(0, 10) : null);
const pidOf = (ref: string | undefined) => (ref?.startsWith('Patient/') ? idNum(ref.slice(8)) : null);

export interface OmopTables {
  PERSON: Record<string, unknown>[];
  VISIT_OCCURRENCE: Record<string, unknown>[];
  CONDITION_OCCURRENCE: Record<string, unknown>[];
  DRUG_EXPOSURE: Record<string, unknown>[];
  MEASUREMENT: Record<string, unknown>[];
}

export function toOmop(input: {
  patients: Patient[];
  encounters: Encounter[];
  conditions: Condition[];
  medications: MedicationRequest[];
  observations: Observation[];
}): OmopTables {
  const PERSON = input.patients.map((p) => {
    const [y, m, d] = (p.birthDate ?? '').split('-').map(Number);
    return {
      person_id: idNum(p.id),
      gender_concept_id: GENDER_CONCEPT[p.gender ?? ''] ?? 0,
      year_of_birth: y ?? null,
      month_of_birth: m ?? null,
      day_of_birth: d ?? null,
      race_concept_id: 0,
      ethnicity_concept_id: 0,
      location_id: null,
      person_source_value: p.id,
      gender_source_value: p.gender ?? null,
    };
  });
  const VISIT_OCCURRENCE = input.encounters.map((e) => ({
    visit_occurrence_id: idNum(e.id),
    person_id: pidOf(e.subject?.reference),
    visit_concept_id: VISIT_CONCEPT[e.class.code ?? ''] ?? 0,
    visit_start_date: ymd(e.period?.start),
    visit_end_date: ymd(e.period?.end ?? e.period?.start),
    visit_type_concept_id: 32817, // EHR
    visit_source_value: e.class.code ?? null,
  }));
  const CONDITION_OCCURRENCE = input.conditions.map((c) => {
    const snomed = c.code?.coding?.find((x) => x.system === SYS.snomed)?.code;
    const icd = c.code?.coding?.find((x) => x.system === SYS.icd10)?.code;
    return {
      condition_occurrence_id: idNum(c.id),
      person_id: pidOf(c.subject.reference),
      condition_concept_id: snomed ? (CONDITION_CONCEPT[snomed] ?? 0) : 0,
      condition_start_date: ymd(c.onsetDateTime ?? c.recordedDate),
      condition_type_concept_id: 32817,
      condition_status_concept_id: 0,
      visit_occurrence_id: c.encounter?.reference ? idNum(c.encounter.reference.split('/')[1]) : null,
      condition_source_value: icd ?? snomed ?? c.code?.text ?? null,
    };
  });
  const DRUG_EXPOSURE = input.medications.map((m) => {
    const rx = m.medicationCodeableConcept?.coding?.find((x) => x.system === SYS.rxnorm);
    return {
      drug_exposure_id: idNum(m.id),
      person_id: pidOf(m.subject.reference),
      drug_concept_id: 0,
      drug_exposure_start_date: ymd(m.authoredOn),
      drug_type_concept_id: 32838, // EHR prescription
      sig: m.dosageInstruction?.[0]?.text ?? null,
      drug_source_value: rx ? `RxNorm:${rx.code} ${rx.display ?? ''}`.trim() : (m.medicationCodeableConcept?.text ?? null),
      drug_source_concept_id: 0,
    };
  });
  const MEASUREMENT: Record<string, unknown>[] = [];
  for (const o of input.observations) {
    const push = (code: string | undefined, value: number | undefined, unit: string | undefined, suffix = '') => {
      if (value === undefined) return;
      MEASUREMENT.push({
        measurement_id: idNum(`${o.id}${suffix}`),
        person_id: pidOf(o.subject?.reference),
        measurement_concept_id: code ? (MEASUREMENT_CONCEPT[code] ?? 0) : 0,
        measurement_date: ymd(o.effectiveDateTime),
        measurement_datetime: o.effectiveDateTime ?? null,
        measurement_type_concept_id: 32817,
        value_as_number: value,
        unit_source_value: unit ?? null,
        measurement_source_value: code ? `LOINC:${code}` : null,
      });
    };
    if (o.component?.length) o.component.forEach((c, i) => push(c.code.coding?.[0]?.code, c.valueQuantity?.value, c.valueQuantity?.unit, `#${i}`));
    else push(o.code.coding?.find((c) => c.system === SYS.loinc)?.code, o.valueQuantity?.value, o.valueQuantity?.unit);
  }
  return { PERSON, VISIT_OCCURRENCE, CONDITION_OCCURRENCE, DRUG_EXPOSURE, MEASUREMENT };
}

export function mappingCoverage(rows: Record<string, unknown>[], conceptField: string): number {
  if (!rows.length) return 1;
  return rows.filter((r) => (r[conceptField] as number) > 0).length / rows.length;
}
