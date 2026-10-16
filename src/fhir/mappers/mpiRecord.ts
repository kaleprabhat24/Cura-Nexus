import type { MpiRecord } from '@/engines/mpi';
import type { PatientIdentifiers } from '@/fhir/contracts';
import { SYS } from '../codes';
import type { Patient } from '../types';

/** Project a FHIR Patient onto the fields the MPI compares. */
export function patientToMpi(p: Patient): MpiRecord {
  const n = p.name?.find((x) => x.use === 'official') ?? p.name?.[0];
  let given = n?.given?.join(' ') ?? '';
  let family = n?.family ?? '';
  if (!given && !family && n?.text) {
    const parts = n.text.trim().split(/\s+/);
    family = parts.length > 1 ? parts.pop()! : '';
    given = parts.join(' ');
  }
  const a = p.address?.[0];
  return {
    id: p.id!,
    given,
    family,
    birthDate: p.birthDate,
    gender: p.gender,
    phone: p.telecom?.find((t) => t.system === 'phone')?.value,
    abha: p.identifier?.find((i) => i.system === SYS.abha)?.value,
    mrn: p.identifier?.find((i) => i.system === SYS.mrn)?.value,
    city: a?.city,
    postalCode: a?.postalCode,
    addressLine: [...(a?.line ?? []), a?.text].filter(Boolean).join(' '),
  };
}

/** Project contract identifiers onto an MPI probe record. */
export function identifiersToMpi(id: PatientIdentifiers, probeId = 'probe'): MpiRecord {
  let given = id.given ?? '';
  let family = id.family ?? '';
  if (!given && !family && id.name) {
    const parts = id.name.trim().split(/\s+/);
    family = parts.length > 1 ? parts.pop()! : '';
    given = parts.join(' ');
  }
  return { id: probeId, given, family, birthDate: id.birthDate, gender: id.gender, phone: id.phone, abha: id.abha?.replace(/[-\s]/g, ''), mrn: id.mrn };
}

export function identifiersLabel(id: PatientIdentifiers): string {
  const name = id.name ?? [id.given, id.family].filter(Boolean).join(' ');
  return [name || 'Unnamed', id.birthDate, id.mrn ? `MRN ${id.mrn}` : '', id.abha ? `ABHA ${id.abha}` : ''].filter(Boolean).join(' · ');
}
