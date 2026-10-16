/**
 * Map module results (contract JSON) to FHIR resources, and FHIR Bundles back to the
 * contract. Resource ids are derived deterministically from the source identifiers so that
 * re-importing the same result is idempotent.
 */
import { stableId } from '@/lib/ids';
import { cc, DOC_TYPES, EXT, SYS } from '../codes';
import { ext, ref } from '../builders';
import type {
  Bundle,
  Communication,
  DiagnosticReport,
  Flag,
  FhirResource,
  ImagingStudy,
  Observation,
  Patient,
  RiskAssessment,
  Task,
} from '../types';
import {
  CHRONIC_CONTRACT,
  CXR_CONTRACT,
  type ChronicBatch,
  type ChronicPatient,
  type CxrBatch,
  type CxrImage,
  type PatientIdentifiers,
} from '../contracts';

export const MODULE1 = { key: 'module1', name: 'Module 1 — CXR triage', short: 'CXR triage' } as const;
export const MODULE2 = { key: 'module2', name: 'Module 2 — Chronic care', short: 'Chronic care' } as const;

export const CXR_SCORE_CODE = cc(SYS.cura, 'cxr-anomaly-score', 'Chest X-ray reconstruction anomaly score');
export const CHRONIC_RISK_CODE = cc(SYS.curaRisk, 'chronic-followup-risk', 'Chronic-disease follow-up risk');

const PRIORITY_TASK: Record<CxrImage['priority'], Task['priority']> = { Critical: 'stat', Review: 'urgent', Routine: 'routine' };

export function deviceId(model: { name: string; version: string }): string {
  return stableId('dev', model.name, model.version);
}

export function deviceFor(model: { name: string; version: string }, moduleName: string) {
  return {
    resourceType: 'Device' as const,
    id: deviceId(model),
    status: 'active' as const,
    deviceName: [{ name: model.name, type: 'model-name' as const }],
    version: [{ value: model.version }],
    manufacturer: moduleName,
    type: { text: 'AI model (external module)' },
    note: [{ text: `Trained and operated in ${moduleName}; Cura Nexus only stores its outputs.` }],
  };
}

/* ───────────── CXR → FHIR ───────────── */

export function cxrToFhir(batch: CxrBatch, img: CxrImage, patientId: string): FhirResource[] {
  const subject = ref('Patient', patientId);
  const isId = stableId('cxr-is', img.studyId);
  const obsId = stableId('cxr-obs', img.studyId, batch.model.name, batch.model.version);
  const drId = stableId('cxr-dr', img.studyId);
  const taskId = stableId('cxr-task', img.studyId);
  const device = ref('Device', deviceId(batch.model), `${batch.model.name} v${batch.model.version}`);
  const decision = img.radiologistDecision;
  const finalPriority = decision?.finalPriority ?? img.priority;
  const reviewed = decision && decision.decision !== 'pending';
  const when = img.acquiredAt ?? batch.runAt;
  const commonExt = [ext(EXT.batchId, { valueString: batch.batchId }), ext(EXT.modelVersion, { valueString: `${batch.model.name}@${batch.model.version}` })];

  const study: ImagingStudy = {
    resourceType: 'ImagingStudy',
    id: isId,
    identifier: [{ system: SYS.module1, value: img.studyId }],
    status: 'available',
    modality: [{ system: SYS.dicomDcm, code: 'DX', display: 'Digital Radiography' }],
    subject,
    started: when,
    numberOfSeries: 1,
    numberOfInstances: 1,
    description: `Chest X-ray${img.view ? ` (${img.view})` : ''}`,
    procedureCode: [cc(SYS.loinc, DOC_TYPES.cxrReport.code, DOC_TYPES.cxrReport.display)],
    series: [{ uid: `${img.studyId}.1`, modality: { system: SYS.dicomDcm, code: 'DX' }, bodySite: { system: SYS.snomed, code: '51185008', display: 'Thoracic structure' }, numberOfInstances: 1 }],
    extension: commonExt,
  };
  const obs: Observation = {
    resourceType: 'Observation',
    id: obsId,
    identifier: [{ system: SYS.module1, value: `${img.studyId}:score:${batch.model.version}` }],
    status: reviewed ? 'final' : 'preliminary',
    category: [cc(SYS.obsCategory, 'imaging', 'Imaging')],
    code: CXR_SCORE_CODE,
    subject,
    effectiveDateTime: batch.runAt,
    device,
    valueQuantity: { value: img.anomalyScore, unit: 'score' },
    component: [
      { code: cc(SYS.cura, 'cxr-rank', 'Batch rank'), valueQuantity: { value: img.rank, unit: 'rank' } },
      { code: cc(SYS.cura, 'cxr-priority', 'Model priority'), valueString: img.priority },
    ],
    derivedFrom: [ref('ImagingStudy', isId)],
    extension: commonExt,
  };
  const report: DiagnosticReport = {
    resourceType: 'DiagnosticReport',
    id: drId,
    identifier: [{ system: SYS.module1, value: img.studyId }],
    status: reviewed ? 'final' : 'preliminary',
    category: [cc(SYS.diagnosticService, 'RAD', 'Radiology')],
    code: cc(SYS.loinc, DOC_TYPES.cxrReport.code, DOC_TYPES.cxrReport.display),
    subject,
    effectiveDateTime: when,
    issued: batch.runAt,
    result: [ref('Observation', obsId)],
    imagingStudy: [ref('ImagingStudy', isId)],
    conclusion: [
      `AI triage (${batch.model.name} v${batch.model.version}): anomaly score ${img.anomalyScore}, rank ${img.rank} in batch ${batch.batchId}, priority ${img.priority}.`,
      img.findings ? `Model note: ${img.findings}` : '',
      reviewed ? `Radiologist ${decision!.decision}${decision!.reviewer ? ` by ${decision!.reviewer}` : ''}${decision!.finalPriority ? ` — final priority ${decision!.finalPriority}` : ''}.${decision!.notes ? ` ${decision!.notes}` : ''}` : 'Awaiting radiologist review.',
    ]
      .filter(Boolean)
      .join(' '),
    presentedForm: [
      ...(img.thumbnail ? [{ contentType: img.thumbnail.startsWith('data:image/') ? img.thumbnail.slice(5, img.thumbnail.indexOf(';')) : 'image/png', ...(img.thumbnail.startsWith('data:') ? { data: img.thumbnail.split(',')[1] } : { url: img.thumbnail }), title: 'Thumbnail' }] : []),
      ...(img.heatmap ? [{ contentType: img.heatmap.startsWith('data:image/') ? img.heatmap.slice(5, img.heatmap.indexOf(';')) : 'image/png', ...(img.heatmap.startsWith('data:') ? { data: img.heatmap.split(',')[1] } : { url: img.heatmap }), title: 'Anomaly heatmap' }] : []),
    ],
    extension: [...commonExt, ext(EXT.cxrRank, { valueInteger: img.rank }), ext(EXT.cxrPriority, { valueCode: finalPriority })],
  };
  if (!report.presentedForm!.length) delete report.presentedForm;
  const task: Task = {
    resourceType: 'Task',
    id: taskId,
    identifier: [{ system: SYS.module1, value: `${img.studyId}:review` }],
    status: reviewed ? 'completed' : 'requested',
    intent: 'order',
    priority: PRIORITY_TASK[finalPriority],
    code: cc(SYS.cura, 'radiologist-review', 'Radiologist review of AI-triaged chest X-ray'),
    description: `Review CXR ${img.studyId} (AI priority ${img.priority}, rank ${img.rank})`,
    focus: ref('DiagnosticReport', drId),
    for: subject,
    authoredOn: batch.runAt,
    businessStatus: { text: reviewed ? decision!.decision : 'awaiting review' },
  };
  const out: FhirResource[] = [study, obs, report, task];
  if (finalPriority === 'Critical' && !(reviewed && decision!.decision === 'overridden' && decision!.finalPriority !== 'Critical')) {
    const flag: Flag = {
      resourceType: 'Flag',
      id: stableId('cxr-flag', img.studyId),
      status: reviewed ? 'inactive' : 'active',
      category: [cc(SYS.flagCategory, 'clinical', 'Clinical')],
      code: cc(SYS.cura, 'cxr-critical', 'Critical chest X-ray triage result'),
      subject,
      period: { start: batch.runAt },
      author: device,
    };
    out.push(flag);
  }
  return out;
}

/* ───────────── Chronic → FHIR ───────────── */

export function chronicToFhir(batch: ChronicBatch, item: ChronicPatient, patientId: string): FhirResource[] {
  const subject = ref('Patient', patientId);
  const assessed = item.assessedAt ?? batch.generatedAt;
  const key = item.externalId ?? patientId;
  const raId = stableId('chr-ra', batch.model.name, key, assessed);
  const device = ref('Device', deviceId(batch.model), `${batch.model.name} v${batch.model.version}`);
  const tierCode = item.tier.toLowerCase();
  const ra: RiskAssessment = {
    resourceType: 'RiskAssessment',
    id: raId,
    identifier: [{ system: SYS.module2, value: `${key}:${assessed}` }],
    status: 'final',
    method: cc(SYS.curaRisk, 'module2-chronic', `${batch.model.name} v${batch.model.version}`),
    code: CHRONIC_RISK_CODE,
    subject,
    occurrenceDateTime: assessed,
    performer: device,
    prediction: [
      {
        outcome: { text: item.condition ? `Adverse outcome without follow-up (${item.condition})` : 'Adverse outcome without timely follow-up' },
        probabilityDecimal: Math.round(item.riskScore * 10000) / 10000,
        qualitativeRisk: cc(SYS.riskProbability, tierCode === 'medium' ? 'moderate' : tierCode, item.tier),
        rationale: item.factors.length ? `Top factors: ${item.factors.slice(0, 3).map((f) => f.name).join(', ')}` : undefined,
      },
    ],
    mitigation: item.recommendedAction,
    extension: [
      ext(EXT.modelVersion, { valueString: `${batch.model.name}@${batch.model.version}` }),
      ...(batch.batchId ? [ext(EXT.batchId, { valueString: batch.batchId })] : []),
      ...item.factors.map((f) =>
        ext(EXT.contributingFactor, {
          extension: [
            { url: 'name', valueString: f.name },
            { url: 'weight', valueDecimal: f.weight },
            ...(f.value !== undefined ? [{ url: 'value', valueString: String(f.value) }] : []),
            ...(f.direction ? [{ url: 'direction', valueCode: f.direction }] : []),
          ],
        }),
      ),
    ],
  };
  const out: FhirResource[] = [ra];
  out.push({
    resourceType: 'Flag',
    id: stableId('chr-flag', key),
    status: item.tier === 'Low' ? 'inactive' : 'active',
    category: [cc(SYS.flagCategory, 'clinical', 'Clinical')],
    code: cc(SYS.cura, `chronic-${tierCode}`, `${item.tier} priority chronic-care follow-up`),
    subject,
    period: { start: assessed },
    author: device,
  } satisfies Flag);
  const taskId = stableId('chr-task', key, assessed);
  const completed = item.outcomes.some((o) => o.outcome === 'completed' || o.outcome === 'scheduled');
  out.push({
    resourceType: 'Task',
    id: taskId,
    identifier: [{ system: SYS.module2, value: `${key}:${assessed}:outreach` }],
    status: completed ? 'completed' : item.outcomes.length ? 'in-progress' : 'requested',
    intent: 'plan',
    priority: item.tier === 'High' ? 'urgent' : item.tier === 'Medium' ? 'asap' : 'routine',
    code: cc(SYS.cura, 'chronic-outreach', 'Chronic-care follow-up outreach'),
    description: item.recommendedAction ?? `Follow up (${item.tier} priority)`,
    focus: ref('RiskAssessment', raId),
    for: subject,
    authoredOn: assessed,
    extension: item.externalId ? [ext(EXT.sourceSystem, { valueString: `module2:${item.externalId}` })] : undefined,
  } satisfies Task);
  item.outcomes.forEach((o) => out.push(outreachCommunication(patientId, taskId, o, item.externalId)));
  return out;
}

const CHANNEL_DISPLAY: Record<string, string> = { phone: 'Telephone', sms: 'SMS', whatsapp: 'WhatsApp', visit: 'Home visit', email: 'Email', other: 'Other' };

export function outreachCommunication(
  patientId: string,
  taskId: string,
  o: { channel: string; date: string; outcome: string; notes?: string; by?: string },
  externalId?: string,
): Communication {
  return {
    resourceType: 'Communication',
    id: stableId('chr-comm', patientId, taskId, o.date, o.channel, o.outcome),
    basedOn: [ref('Task', taskId)],
    status: o.outcome === 'no-answer' || o.outcome === 'wrong-number' ? 'not-done' : 'completed',
    statusReason: o.outcome === 'no-answer' || o.outcome === 'wrong-number' ? { text: o.outcome } : undefined,
    category: [cc(SYS.communicationCategory, 'reminder', 'Reminder')],
    medium: [{ coding: [{ system: SYS.participationMode, code: o.channel.toUpperCase(), display: CHANNEL_DISPLAY[o.channel] ?? o.channel }], text: CHANNEL_DISPLAY[o.channel] ?? o.channel }],
    subject: ref('Patient', patientId),
    sent: o.date,
    payload: [{ contentString: `Outreach outcome: ${o.outcome}${o.notes ? ` — ${o.notes}` : ''}` }],
    note: o.by ? [{ text: `Recorded by ${o.by}` }] : undefined,
    extension: [ext(EXT.sourceSystem, { valueString: externalId ? `module2:${externalId}` : 'cura-nexus' }), ext(EXT.outreachOutcome, { valueCode: o.outcome })],
  };
}

export function communicationOutcome(c: Communication): string {
  return c.extension?.find((e) => e.url === EXT.outreachOutcome)?.valueCode ?? c.statusReason?.text ?? (c.status === 'completed' ? 'reached' : c.status);
}

export function contributingFactors(ra: RiskAssessment): { name: string; weight: number; value?: string; direction?: string }[] {
  return (ra.extension ?? [])
    .filter((e) => e.url === EXT.contributingFactor)
    .map((e) => ({
      name: e.extension?.find((x) => x.url === 'name')?.valueString ?? '?',
      weight: e.extension?.find((x) => x.url === 'weight')?.valueDecimal ?? 0,
      value: e.extension?.find((x) => x.url === 'value')?.valueString,
      direction: e.extension?.find((x) => x.url === 'direction')?.valueCode,
    }));
}

/* ───────────── FHIR Bundle → contract ───────────── */

function identifiersFromPatient(p: Patient | undefined): PatientIdentifiers {
  if (!p) return {};
  const n = p.name?.[0];
  return {
    mrn: p.identifier?.find((i) => i.system === SYS.mrn)?.value,
    abha: p.identifier?.find((i) => i.system === SYS.abha)?.value,
    given: n?.given?.join(' '),
    family: n?.family,
    name: n?.text,
    birthDate: p.birthDate,
    gender: p.gender,
    phone: p.telecom?.find((t) => t.system === 'phone')?.value,
  };
}

function resolver(bundle: Bundle) {
  const map = new Map<string, FhirResource>();
  for (const e of bundle.entry ?? []) {
    if (!e.resource) continue;
    if (e.fullUrl) map.set(e.fullUrl, e.resource);
    if (e.resource.id) map.set(`${e.resource.resourceType}/${e.resource.id}`, e.resource);
  }
  return (r?: string) => (r ? map.get(r) : undefined);
}

export function bundleToCxr(bundle: Bundle): unknown {
  const get = resolver(bundle);
  const reports = (bundle.entry ?? []).map((e) => e.resource).filter((r): r is DiagnosticReport => r?.resourceType === 'DiagnosticReport');
  const first = (bundle.entry ?? []).map((e) => e.resource).find((r): r is Observation => r?.resourceType === 'Observation');
  const modelVer = first?.extension?.find((e) => e.url === EXT.modelVersion)?.valueString ?? first?.device?.display ?? 'unknown@unknown';
  const [mname, mver] = modelVer.includes('@') ? modelVer.split('@') : [modelVer, 'unknown'];
  const images = reports.map((dr, i) => {
    const obs = get(dr.result?.[0]?.reference) as Observation | undefined;
    const study = get(dr.imagingStudy?.[0]?.reference) as ImagingStudy | undefined;
    const patient = get(dr.subject?.reference) as Patient | undefined;
    const rank = obs?.component?.find((c) => c.code.coding?.[0]?.code === 'cxr-rank')?.valueQuantity?.value ?? dr.extension?.find((e) => e.url === EXT.cxrRank)?.valueInteger ?? i + 1;
    const priority = obs?.component?.find((c) => c.code.coding?.[0]?.code === 'cxr-priority')?.valueString ?? dr.extension?.find((e) => e.url === EXT.cxrPriority)?.valueCode ?? 'Review';
    return {
      patient: identifiersFromPatient(patient),
      studyId: study?.identifier?.[0]?.value ?? dr.identifier?.[0]?.value ?? study?.id ?? dr.id,
      acquiredAt: study?.started ?? dr.effectiveDateTime,
      anomalyScore: obs?.valueQuantity?.value ?? 0,
      rank,
      priority,
      findings: dr.conclusion,
    };
  });
  return {
    contract: CXR_CONTRACT,
    batchId: bundle.identifier?.value ?? bundle.id ?? 'fhir-bundle',
    model: { name: mname, version: mver },
    runAt: bundle.timestamp ?? reports[0]?.issued ?? new Date().toISOString(),
    images,
  };
}

export function bundleToChronic(bundle: Bundle): unknown {
  const get = resolver(bundle);
  const resources = (bundle.entry ?? []).map((e) => e.resource).filter((r): r is FhirResource => !!r);
  const ras = resources.filter((r): r is RiskAssessment => r.resourceType === 'RiskAssessment');
  const tasks = resources.filter((r): r is Task => r.resourceType === 'Task');
  const comms = resources.filter((r): r is Communication => r.resourceType === 'Communication');
  const mv = ras[0]?.extension?.find((e) => e.url === EXT.modelVersion)?.valueString ?? ras[0]?.method?.text ?? 'unknown@unknown';
  const [mname, mver] = mv.includes('@') ? mv.split('@') : [mv, 'unknown'];
  return {
    contract: CHRONIC_CONTRACT,
    batchId: bundle.identifier?.value ?? bundle.id,
    model: { name: mname, version: mver },
    generatedAt: bundle.timestamp ?? ras[0]?.occurrenceDateTime ?? new Date().toISOString(),
    patients: ras.map((ra) => {
      const pred = ra.prediction?.[0];
      const task = tasks.find((t) => t.focus?.reference === `RiskAssessment/${ra.id}` || t.for?.reference === ra.subject.reference);
      const qual = pred?.qualitativeRisk?.coding?.[0]?.code ?? pred?.qualitativeRisk?.text ?? 'medium';
      return {
        patient: identifiersFromPatient(get(ra.subject.reference) as Patient | undefined),
        riskScore: pred?.probabilityDecimal ?? 0,
        tier: qual === 'high' ? 'High' : qual === 'low' ? 'Low' : 'Medium',
        assessedAt: ra.occurrenceDateTime,
        factors: contributingFactors(ra).map((f) => ({ name: f.name, weight: f.weight, value: f.value })),
        recommendedAction: ra.mitigation ?? task?.description,
        outcomes: comms
          .filter((c) => c.subject?.reference === ra.subject.reference)
          .map((c) => ({ channel: (c.medium?.[0]?.coding?.[0]?.code ?? 'other').toLowerCase(), date: c.sent ?? ra.occurrenceDateTime ?? '', outcome: communicationOutcome(c), notes: c.payload?.[0]?.contentString })),
      };
    }),
  };
}
