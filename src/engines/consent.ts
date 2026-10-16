/**
 * Consent enforcement engine (FHIR R4 Consent, ABDM-aligned).
 *
 * Evaluation for a request (actor, purpose, resource type, time):
 *  1. Only `active` consents for the patient whose provision period covers the time apply.
 *  2. A provision applies when its actor, purpose and class (resource type) constraints all
 *     match — an empty constraint matches anything.
 *  3. Nested provisions are exceptions to their parent (the most specific applicable one
 *     wins), so "permit everything except mental-health notes" is expressible.
 *  4. Across consents, an applicable deny overrides any permit. No applicable permit → deny.
 */
import type { Consent, ConsentProvision } from '@/fhir/types';

export interface AccessActor {
  /** e.g. "Practitioner/pr-doc1"; organisation membership is passed separately. */
  reference: string;
  role: string;
  organizations: string[]; // e.g. ["Organization/org-cura"]
}

export interface AccessRequest {
  patientId: string;
  actor: AccessActor;
  purpose: string;
  resourceType: string;
  at?: Date;
}

export interface ConsentDecision {
  decision: 'permit' | 'deny';
  consentId?: string;
  reason: string;
}

function inPeriod(p: { start?: string; end?: string } | undefined, at: Date): boolean {
  if (!p) return true;
  if (p.start && new Date(p.start).getTime() > at.getTime()) return false;
  if (p.end && new Date(p.end).getTime() < at.getTime()) return false;
  return true;
}

function actorMatches(prov: ConsentProvision, actor: AccessActor): boolean {
  if (!prov.actor?.length) return true;
  return prov.actor.some((a) => {
    const r = a.reference.reference;
    if (!r) return false;
    if (r === actor.reference) return true;
    if (actor.organizations.includes(r)) return true;
    // Role-based grant, e.g. reference "urn:cura-nexus:role/nurse"
    return r === `urn:cura-nexus:role/${actor.role}`;
  });
}

function purposeMatches(prov: ConsentProvision, purpose: string): boolean {
  return !prov.purpose?.length || prov.purpose.some((p) => p.code === purpose);
}

function classMatches(prov: ConsentProvision, resourceType: string): boolean {
  return !prov.class?.length || prov.class.some((c) => c.code === resourceType);
}

function applies(prov: ConsentProvision, req: AccessRequest, at: Date): boolean {
  return inPeriod(prov.period, at) && actorMatches(prov, req.actor) && purposeMatches(prov, req.purpose) && classMatches(prov, req.resourceType);
}

/** Returns the effective type of the most specific applicable provision, or undefined. */
function evaluateProvision(prov: ConsentProvision, req: AccessRequest, at: Date, inherited: 'permit' | 'deny'): 'permit' | 'deny' | undefined {
  if (!applies(prov, req, at)) return undefined;
  const type = prov.type ?? inherited;
  for (const child of prov.provision ?? []) {
    const r = evaluateProvision(child, req, at, type);
    if (r) return r;
  }
  return type;
}

export function evaluateConsent(consents: Consent[], req: AccessRequest): ConsentDecision {
  const at = req.at ?? new Date();
  const relevant = consents.filter(
    (c) => c.status === 'active' && c.patient?.reference === `Patient/${req.patientId}` && inPeriod(c.provision?.period, at),
  );
  if (!relevant.length) return { decision: 'deny', reason: 'No active consent on file for this patient' };
  let permit: Consent | undefined;
  for (const c of relevant) {
    if (!c.provision) continue;
    const result = evaluateProvision(c.provision, req, at, 'deny');
    if (result === 'deny') {
      return { decision: 'deny', consentId: c.id, reason: `Consent ${c.id} denies ${req.resourceType} for purpose ${req.purpose}` };
    }
    if (result === 'permit') permit ??= c;
  }
  if (permit) return { decision: 'permit', consentId: permit.id, reason: `Permitted by consent ${permit.id}` };
  return { decision: 'deny', reason: `No consent permits ${req.resourceType} access for purpose ${req.purpose} by this actor` };
}

/** Human-readable summary of a consent's provisions (for the consent artefact view). */
export function describeConsent(c: Consent): string[] {
  const lines: string[] = [];
  const walk = (p: ConsentProvision, depth: number) => {
    const who = p.actor?.map((a) => a.reference.display ?? a.reference.reference).join(', ') || 'any authorised actor';
    const what = p.class?.map((x) => x.code).join(', ') || 'all record types';
    const why = p.purpose?.map((x) => x.display ?? x.code).join(', ') || 'any purpose';
    const when = p.period ? `${p.period.start?.slice(0, 10) ?? '…'} → ${p.period.end?.slice(0, 10) ?? 'open'}` : 'no time limit';
    lines.push(`${'  '.repeat(depth)}${(p.type ?? 'permit').toUpperCase()} ${what} to ${who} for ${why} (${when})`);
    p.provision?.forEach((child) => walk(child, depth + 1));
  };
  if (c.provision) walk(c.provision, 0);
  return lines;
}
