/** Builders and accessors for common FHIR structures. */
import { cc, SYS, EXT } from './codes';
import type { AuditEvent, CodeableConcept, Extension, Patient, Provenance, Reference } from './types';
import { isoNow } from '@/lib/format';
import { uid } from '@/lib/ids';

export const ORG_REF: Reference = { reference: 'Organization/org-cura', display: 'Cura Nexus Hospital' };
export const SYSTEM_DEVICE: Reference = { reference: 'Device/cura-nexus', display: 'Cura Nexus platform' };

export function ref(resourceType: string, id: string, display?: string): Reference {
  return display ? { reference: `${resourceType}/${id}`, display } : { reference: `${resourceType}/${id}` };
}

export function refId(r: Reference | undefined): string | undefined {
  return r?.reference?.split('/').pop();
}

/* ───────────── Patient accessors ───────────── */

export function patientName(p: Patient | undefined): string {
  if (!p) return 'Unknown patient';
  const n = p.name?.find((x) => x.use === 'official') ?? p.name?.[0];
  if (!n) return 'Unnamed patient';
  return n.text ?? [...(n.given ?? []), n.family].filter(Boolean).join(' ');
}

export function identifierValue(p: Patient | undefined, system: string): string | undefined {
  return p?.identifier?.find((i) => i.system === system)?.value;
}

export const mrnOf = (p: Patient | undefined) => identifierValue(p, SYS.mrn);
export const abhaOf = (p: Patient | undefined) => identifierValue(p, SYS.abha);
export const abhaAddressOf = (p: Patient | undefined) => identifierValue(p, SYS.abhaAddress);

export function phoneOf(p: Patient | undefined): string | undefined {
  return p?.telecom?.find((t) => t.system === 'phone')?.value;
}

export function emailOf(p: Patient | undefined): string | undefined {
  return p?.telecom?.find((t) => t.system === 'email')?.value;
}

export function cityOf(p: Patient | undefined): string | undefined {
  return p?.address?.[0]?.city;
}

export function addressText(p: Patient | undefined): string {
  const a = p?.address?.[0];
  if (!a) return '—';
  return a.text ?? [...(a.line ?? []), a.city, a.state, a.postalCode].filter(Boolean).join(', ');
}

/* ───────────── Extensions ───────────── */

export function ext(url: string, value: Omit<Extension, 'url'>): Extension {
  return { url, ...value };
}

export function getExt(resource: { extension?: Extension[] } | undefined, url: string): Extension | undefined {
  return resource?.extension?.find((e) => e.url === url);
}

/* ───────────── Provenance & AuditEvent ───────────── */

export interface Actor {
  id: string;
  name: string;
  role: string;
  practitionerId?: string;
}

export function actorRef(actor: Actor): Reference {
  return actor.practitionerId
    ? ref('Practitioner', actor.practitionerId, actor.name)
    : actor.role === 'patient'
      ? { reference: undefined, display: `${actor.name} (patient)`, identifier: { system: 'urn:cura-nexus:user', value: actor.id } }
      : { display: actor.name, identifier: { system: 'urn:cura-nexus:user', value: actor.id } };
}

export interface ProvenanceInput {
  targets: Reference[];
  activity: 'CREATE' | 'UPDATE' | 'DELETE' | 'MERGE' | 'UNMERGE' | 'IMPORT' | 'REVIEW' | 'SIGN';
  agent: Reference;
  agentType?: 'author' | 'performer' | 'enterer' | 'assembler' | 'verifier' | 'attester';
  onBehalfOf?: Reference;
  device?: Reference;
  sourceSystem: string;
  reason?: string;
  entities?: { role: 'derivation' | 'revision' | 'quotation' | 'source' | 'removal'; what: Reference }[];
  signature?: { hash: string; who: Reference };
}

const ACTIVITY_DISPLAY: Record<ProvenanceInput['activity'], string> = {
  CREATE: 'create',
  UPDATE: 'revise',
  DELETE: 'delete',
  MERGE: 'merge',
  UNMERGE: 'unmerge',
  IMPORT: 'import',
  REVIEW: 'review',
  SIGN: 'sign',
};

export function buildProvenance(input: ProvenanceInput): Provenance {
  const now = isoNow();
  const agents: Provenance['agent'] = [
    {
      type: cc(SYS.provenanceAgent, input.agentType ?? 'author', input.agentType ?? 'author'),
      who: input.agent,
      onBehalfOf: input.onBehalfOf,
    },
  ];
  if (input.device) agents.push({ type: cc(SYS.provenanceAgent, 'assembler', 'Assembler'), who: input.device });
  return {
    resourceType: 'Provenance',
    id: uid('prov'),
    target: input.targets,
    recorded: now,
    occurredDateTime: now,
    activity: cc(SYS.dataOperation, input.activity, ACTIVITY_DISPLAY[input.activity]),
    reason: input.reason ? [{ text: input.reason }] : undefined,
    agent: agents,
    entity: input.entities,
    extension: [ext(EXT.sourceSystem, { valueString: input.sourceSystem })],
    signature: input.signature
      ? [
          {
            type: [{ system: 'urn:iso-astm:E1762-95:2013', code: '1.2.840.10065.1.12.1.1', display: "Author's Signature" }],
            when: now,
            who: input.signature.who,
            data: input.signature.hash,
            sigFormat: 'text/plain; sha-256',
          },
        ]
      : undefined,
  };
}

export type AuditAction = 'C' | 'R' | 'U' | 'D' | 'E';
export type AuditOutcome = '0' | '4' | '8' | '12';

export interface AuditInput {
  action: AuditAction;
  subtype: string;
  outcome?: AuditOutcome;
  outcomeDesc?: string;
  actor?: Actor;
  patientId?: string;
  entity?: Reference;
  entityName?: string;
  description?: string;
  purpose?: string;
  details?: Record<string, string>;
}

export function buildAuditEvent(input: AuditInput): AuditEvent {
  const purpose: CodeableConcept | undefined = input.purpose ? cc(SYS.actReason, input.purpose, input.purpose) : undefined;
  const entities: AuditEvent['entity'] = [];
  if (input.patientId) entities.push({ what: ref('Patient', input.patientId), type: { system: 'http://terminology.hl7.org/CodeSystem/audit-entity-type', code: '1', display: 'Person' } });
  if (input.entity) {
    entities.push({
      what: input.entity,
      name: input.entityName,
      description: input.description,
      detail: input.details ? Object.entries(input.details).map(([type, valueString]) => ({ type, valueString })) : undefined,
    });
  } else if (input.description || input.details) {
    entities.push({
      name: input.entityName,
      description: input.description,
      detail: input.details ? Object.entries(input.details).map(([type, valueString]) => ({ type, valueString })) : undefined,
    });
  }
  return {
    resourceType: 'AuditEvent',
    id: uid('audit'),
    type: { system: SYS.auditType, code: 'rest', display: 'RESTful Operation' },
    subtype: [{ system: SYS.restful, code: input.subtype, display: input.subtype }],
    action: input.action,
    recorded: isoNow(),
    outcome: input.outcome ?? '0',
    outcomeDesc: input.outcomeDesc,
    purposeOfEvent: purpose ? [purpose] : undefined,
    agent: [
      input.actor
        ? {
            who: actorRef(input.actor),
            name: input.actor.name,
            requestor: true,
            role: [{ text: input.actor.role }],
          }
        : { who: SYSTEM_DEVICE, name: 'system', requestor: false },
    ],
    source: { site: 'Cura Nexus', observer: SYSTEM_DEVICE },
    entity: entities.length ? entities : undefined,
  };
}

export function auditActorName(e: AuditEvent): string {
  return e.agent[0]?.name ?? e.agent[0]?.who?.display ?? 'system';
}

export function auditSubtype(e: AuditEvent): string {
  return e.subtype?.[0]?.code ?? e.type.code ?? '—';
}
