import { cc, SYS } from '../codes';
import { ORG_REF } from '../builders';
import type { Patient } from '../types';

export interface PatientInput {
  id?: string;
  given: string;
  middle?: string;
  family: string;
  gender: 'male' | 'female' | 'other' | 'unknown';
  birthDate: string;
  phone?: string;
  email?: string;
  addressLine?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  mrn: string;
  abha?: string;
  abhaAddress?: string;
  language?: string;
  emergencyName?: string;
  emergencyRelation?: string;
  emergencyPhone?: string;
  active?: boolean;
  extraIdentifiers?: { system: string; value: string }[];
}

const LANG: Record<string, string> = { en: 'English', hi: 'Hindi', mr: 'Marathi', ta: 'Tamil', te: 'Telugu', bn: 'Bengali', kn: 'Kannada', ml: 'Malayalam', gu: 'Gujarati', pa: 'Punjabi' };

export function buildPatient(i: PatientInput): Patient {
  const abha = i.abha?.replace(/\D/g, '');
  return {
    resourceType: 'Patient',
    id: i.id,
    identifier: [
      { use: 'usual', system: SYS.mrn, value: i.mrn, type: cc(SYS.identifierType, 'MR', 'Medical record number') },
      ...(abha ? [{ use: 'official' as const, system: SYS.abha, value: abha, type: { text: 'ABHA number' } }] : []),
      ...(i.abhaAddress ? [{ use: 'secondary' as const, system: SYS.abhaAddress, value: i.abhaAddress, type: { text: 'ABHA address' } }] : []),
      ...(i.extraIdentifiers ?? []),
    ],
    active: i.active ?? true,
    name: [{ use: 'official', family: i.family.trim(), given: [i.given.trim(), ...(i.middle?.trim() ? [i.middle.trim()] : [])] }],
    telecom: [
      ...(i.phone ? [{ system: 'phone' as const, value: i.phone, use: 'mobile' as const }] : []),
      ...(i.email ? [{ system: 'email' as const, value: i.email }] : []),
    ],
    gender: i.gender,
    birthDate: i.birthDate,
    address: i.city || i.addressLine ? [{ use: 'home', line: i.addressLine ? [i.addressLine] : undefined, city: i.city, state: i.state, postalCode: i.postalCode, country: 'IN' }] : undefined,
    communication: i.language ? [{ language: cc('urn:ietf:bcp:47', i.language, LANG[i.language] ?? i.language), preferred: true }] : undefined,
    contact: i.emergencyName
      ? [{ relationship: [{ text: i.emergencyRelation ?? 'Emergency contact' }], name: { text: i.emergencyName }, telecom: i.emergencyPhone ? [{ system: 'phone', value: i.emergencyPhone }] : undefined }]
      : undefined,
    managingOrganization: ORG_REF,
  };
}

export function patientToInput(p: Patient): PatientInput {
  const n = p.name?.find((x) => x.use === 'official') ?? p.name?.[0];
  const a = p.address?.[0];
  const known = new Set<string>([SYS.mrn, SYS.abha, SYS.abhaAddress]);
  return {
    id: p.id,
    given: n?.given?.[0] ?? '',
    middle: n?.given?.slice(1).join(' ') || undefined,
    family: n?.family ?? '',
    gender: p.gender ?? 'unknown',
    birthDate: p.birthDate ?? '',
    phone: p.telecom?.find((t) => t.system === 'phone')?.value,
    email: p.telecom?.find((t) => t.system === 'email')?.value,
    addressLine: a?.line?.join(', '),
    city: a?.city,
    state: a?.state,
    postalCode: a?.postalCode,
    mrn: p.identifier?.find((x) => x.system === SYS.mrn)?.value ?? '',
    abha: p.identifier?.find((x) => x.system === SYS.abha)?.value,
    abhaAddress: p.identifier?.find((x) => x.system === SYS.abhaAddress)?.value,
    language: p.communication?.[0]?.language.coding?.[0]?.code,
    emergencyName: p.contact?.[0]?.name?.text,
    emergencyRelation: p.contact?.[0]?.relationship?.[0]?.text,
    emergencyPhone: p.contact?.[0]?.telecom?.[0]?.value,
    active: p.active,
    extraIdentifiers: (p.identifier ?? []).filter((x) => x.system && !known.has(x.system) && x.value).map((x) => ({ system: x.system!, value: x.value! })),
  };
}
