/**
 * HL7 v2 → FHIR R4 mapping (ADT^A01/A04/A08, ORU^R01).
 * PID → Patient, PV1 → Encounter, DG1 → Condition, OBR → DiagnosticReport, OBX → Observation.
 * The patient is returned as a candidate; the ingestion service resolves it through the MPI.
 */
import { stableId } from '@/lib/ids';
import { hl7Date, hl7DateTime, hl7Get, hl7Repetitions, segment, segmentsNamed, type Hl7Message } from '@/engines/hl7';
import { cc, ENCOUNTER_CLASS, OBS_BY_LOINC, SYS } from '../codes';
import type { Condition, DiagnosticReport, Encounter, Identifier, Observation, Patient } from '../types';

export interface Hl7Mapped {
  event: string;
  patient: Patient; // candidate demographics (id assigned after MPI resolution)
  encounter?: Encounter;
  conditions: Condition[];
  report?: DiagnosticReport;
  observations: Observation[];
  warnings: string[];
}

const SEX: Record<string, Patient['gender']> = { M: 'male', F: 'female', O: 'other', U: 'unknown', A: 'other', N: 'unknown' };
const CLASS: Record<string, keyof typeof ENCOUNTER_CLASS> = { I: 'IMP', O: 'AMB', E: 'EMER', P: 'AMB', R: 'AMB' };
const OBX_STATUS: Record<string, Observation['status']> = { F: 'final', P: 'preliminary', C: 'corrected', X: 'cancelled', R: 'preliminary', W: 'entered-in-error' };
const INTERP: Record<string, string> = { H: 'High', L: 'Low', HH: 'Critical high', LL: 'Critical low', N: 'Normal', A: 'Abnormal' };

function systemFor(codingSystem: string): string {
  const s = codingSystem.toUpperCase();
  if (s === 'LN' || s === 'LOINC') return SYS.loinc;
  if (s === 'SCT' || s === 'SNOMED') return SYS.snomed;
  if (s === 'I10' || s === 'ICD10') return SYS.icd10;
  if (s === 'RXNORM') return SYS.rxnorm;
  return `urn:hl7v2:${codingSystem || 'local'}`;
}

export function mapHl7(msg: Hl7Message): Hl7Mapped {
  const warnings: string[] = [];
  const pid = segment(msg, 'PID');
  if (!pid) throw new Error('Message has no PID segment');

  const identifiers: Identifier[] = hl7Repetitions(msg, pid, 3).map((rep) => {
    const [value = '', , , authority = '', type = ''] = rep.split(msg.encoding.component);
    if (authority.toUpperCase() === 'ABHA' || type === 'NI') return { system: SYS.abha, value: value.replace(/\D/g, '') };
    if (authority.toUpperCase() === 'CURA') return { system: SYS.mrn, value, type: cc(SYS.identifierType, 'MR', 'Medical record number') };
    return { system: `${SYS.sourceRecord}/${authority || msg.sendingApplication}`, value, type: type ? cc(SYS.identifierType, type, type) : undefined };
  });
  const family = hl7Get(msg, pid, 5, 1);
  const given = [hl7Get(msg, pid, 5, 2), hl7Get(msg, pid, 5, 3)].filter(Boolean);
  const birthDate = hl7Date(hl7Get(msg, pid, 7));
  const sex = SEX[hl7Get(msg, pid, 8).toUpperCase()] ?? 'unknown';
  const phone = hl7Get(msg, pid, 13, 1) || hl7Get(msg, pid, 13);
  const street = hl7Get(msg, pid, 11, 1);
  const other = hl7Get(msg, pid, 11, 2);
  const city = hl7Get(msg, pid, 11, 3);
  const state = hl7Get(msg, pid, 11, 4);
  const zip = hl7Get(msg, pid, 11, 5);
  if (!family && !given.length) warnings.push('PID-5 patient name is empty');
  if (!birthDate) warnings.push('PID-7 date of birth is missing or invalid');

  const patient: Patient = {
    resourceType: 'Patient',
    identifier: identifiers,
    active: true,
    name: [{ use: 'official', family, given }],
    gender: sex,
    birthDate,
    telecom: phone ? [{ system: 'phone', value: phone, use: 'mobile' }] : undefined,
    address: street || city ? [{ use: 'home', line: [street, other].filter(Boolean), city, state, postalCode: zip, country: 'IN' }] : undefined,
  };

  const out: Hl7Mapped = { event: msg.messageType, patient, conditions: [], observations: [], warnings };

  const pv1 = segment(msg, 'PV1');
  if (pv1 && (msg.type === 'ADT' && msg.trigger !== 'A08')) {
    const cls = CLASS[hl7Get(msg, pv1, 2).toUpperCase()] ?? 'AMB';
    const visit = hl7Get(msg, pv1, 19) || msg.controlId;
    const start = hl7DateTime(hl7Get(msg, pv1, 44)) ?? msg.timestamp;
    const attending = hl7Get(msg, pv1, 7, 1);
    const ward = hl7Get(msg, pv1, 3, 1);
    const room = hl7Get(msg, pv1, 3, 2);
    const bed = hl7Get(msg, pv1, 3, 3);
    out.encounter = {
      resourceType: 'Encounter',
      id: stableId('enc-hl7', msg.sendingApplication, visit),
      identifier: [{ system: `${SYS.sourceRecord}/${msg.sendingApplication}/visit`, value: visit }],
      status: msg.trigger === 'A01' ? 'in-progress' : 'arrived',
      class: ENCOUNTER_CLASS[cls],
      type: [{ text: hl7Get(msg, pv1, 10) || 'General' }],
      period: { start },
      participant: attending
        ? [{ individual: { display: `Dr ${hl7Get(msg, pv1, 7, 3)} ${hl7Get(msg, pv1, 7, 2)}`.trim(), identifier: { system: `${SYS.sourceRecord}/${msg.sendingApplication}/practitioner`, value: attending } } }]
        : undefined,
      location: ward ? [{ location: { display: [ward, room && `Room ${room}`, bed && `Bed ${bed}`].filter(Boolean).join(' · ') }, status: 'active' }] : undefined,
    };
  }

  for (const dg1 of segmentsNamed(msg, 'DG1')) {
    const code = hl7Get(msg, dg1, 3, 1);
    const text = hl7Get(msg, dg1, 3, 2);
    const sys = hl7Get(msg, dg1, 3, 3);
    out.conditions.push({
      resourceType: 'Condition',
      id: stableId('cond-hl7', msg.controlId, code),
      clinicalStatus: cc(SYS.condClinical, 'active', 'Active'),
      verificationStatus: cc(SYS.condVerification, 'provisional', 'Provisional'),
      category: [cc(SYS.condCategory, 'encounter-diagnosis', 'Encounter Diagnosis')],
      code: { coding: [{ system: systemFor(sys), code, display: text }], text },
      subject: { reference: 'Patient/PENDING' },
      encounter: out.encounter ? { reference: `Encounter/${out.encounter.id}` } : undefined,
      onsetDateTime: hl7DateTime(hl7Get(msg, dg1, 5)) ?? msg.timestamp,
      recordedDate: msg.timestamp,
    });
  }

  const obr = segment(msg, 'OBR');
  if (msg.type === 'ORU') {
    const filler = hl7Get(msg, obr, 3) || msg.controlId;
    const effective = hl7DateTime(hl7Get(msg, obr, 7)) ?? msg.timestamp;
    for (const [i, obx] of segmentsNamed(msg, 'OBX').entries()) {
      const vt = hl7Get(msg, obx, 2);
      const code = hl7Get(msg, obx, 3, 1);
      const display = hl7Get(msg, obx, 3, 2);
      const system = systemFor(hl7Get(msg, obx, 3, 3));
      const raw = hl7Get(msg, obx, 5);
      const unit = hl7Get(msg, obx, 6, 1) || hl7Get(msg, obx, 6);
      const range = hl7Get(msg, obx, 7);
      const flag = hl7Get(msg, obx, 8);
      const status = OBX_STATUS[hl7Get(msg, obx, 11)] ?? 'final';
      const def = system === SYS.loinc ? OBS_BY_LOINC[code] : undefined;
      const obs: Observation = {
        resourceType: 'Observation',
        id: stableId('obs-hl7', msg.sendingApplication, filler, String(i + 1), code),
        identifier: [{ system: `${SYS.sourceRecord}/${msg.sendingApplication}/obx`, value: `${filler}-${i + 1}` }],
        status,
        category: [cc(SYS.obsCategory, def?.category ?? 'laboratory', def?.category === 'vital-signs' ? 'Vital Signs' : 'Laboratory')],
        code: { coding: [{ system, code, display: def?.display ?? display }], text: def?.short ?? display },
        subject: { reference: 'Patient/PENDING' },
        effectiveDateTime: hl7DateTime(hl7Get(msg, obx, 14)) ?? effective,
        issued: msg.timestamp,
      };
      if (vt === 'NM') {
        const v = Number(raw);
        if (Number.isFinite(v)) obs.valueQuantity = { value: v, unit, system: SYS.ucum, code: def?.ucum ?? unit };
        else warnings.push(`OBX-${i + 1}: "${raw}" is not numeric`);
      } else {
        obs.valueString = raw;
      }
      if (flag && INTERP[flag]) obs.interpretation = [cc(SYS.obsInterp, flag, INTERP[flag]!)];
      if (range) obs.referenceRange = [{ text: range }];
      out.observations.push(obs);
    }
    if (obr) {
      out.report = {
        resourceType: 'DiagnosticReport',
        id: stableId('dr-hl7', msg.sendingApplication, filler),
        identifier: [{ system: `${SYS.sourceRecord}/${msg.sendingApplication}/report`, value: filler }],
        status: 'final',
        category: [cc(SYS.diagnosticService, 'LAB', 'Laboratory')],
        code: { coding: [{ system: systemFor(hl7Get(msg, obr, 4, 3)), code: hl7Get(msg, obr, 4, 1), display: hl7Get(msg, obr, 4, 2) }], text: hl7Get(msg, obr, 4, 2) },
        subject: { reference: 'Patient/PENDING' },
        effectiveDateTime: effective,
        issued: msg.timestamp,
        result: out.observations.map((o) => ({ reference: `Observation/${o.id}` })),
      };
    }
  }
  return out;
}

/** Point every mapped resource at the resolved patient id. */
export function bindPatient(m: Hl7Mapped, patientId: string): Hl7Mapped {
  const subject = { reference: `Patient/${patientId}` };
  return {
    ...m,
    encounter: m.encounter ? { ...m.encounter, subject } : undefined,
    conditions: m.conditions.map((c) => ({ ...c, subject })),
    observations: m.observations.map((o) => ({ ...o, subject })),
    report: m.report ? { ...m.report, subject } : undefined,
  };
}
