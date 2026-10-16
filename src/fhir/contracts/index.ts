/**
 * Integration contracts for the independent AI modules.
 *  - Module 1: Batch Chest X-Ray triage (reconstruction-based anomaly detection)
 *  - Module 2: Chronic-disease follow-up risk prioritisation
 * Cura Nexus never computes these scores; it validates, normalises and stores them.
 * See docs/INTEGRATION_CONTRACT.md.
 */
import { z } from 'zod';

const dateish = z
  .string()
  .min(4)
  .refine((s) => !Number.isNaN(new Date(s).getTime()), { message: 'Must be an ISO 8601 date or date-time' });

export const PatientIdentifiersSchema = z
  .object({
    mrn: z.string().trim().min(1).optional(),
    abha: z
      .string()
      .trim()
      .refine((s) => /^\d{14}$/.test(s.replace(/[-\s]/g, '')), { message: 'ABHA number must have 14 digits' })
      .optional(),
    name: z.string().trim().min(1).optional(),
    given: z.string().trim().min(1).optional(),
    family: z.string().trim().min(1).optional(),
    birthDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'birthDate must be YYYY-MM-DD')
      .optional(),
    gender: z.enum(['male', 'female', 'other', 'unknown']).optional(),
    phone: z.string().trim().optional(),
    externalId: z.string().trim().optional(),
  })
  .refine((p) => !!(p.mrn || p.abha || ((p.name || (p.given && p.family)) && p.birthDate)), {
    message: 'Each patient needs an MRN, an ABHA number, or name + birthDate',
  });

export type PatientIdentifiers = z.infer<typeof PatientIdentifiersSchema>;

const ModelSchema = z.object({ name: z.string().min(1), version: z.string().min(1) });

const caseInsensitive = <T extends [string, ...string[]]>(values: T) =>
  z.preprocess((v) => {
    if (typeof v !== 'string') return v;
    const hit = values.find((x) => x.toLowerCase() === v.trim().toLowerCase());
    return hit ?? v;
  }, z.enum(values));

/* ───────────── Module 1 — CXR triage ───────────── */

export const CXR_CONTRACT = 'cura-nexus/cxr-triage@1';

export const RadiologistDecisionSchema = z.object({
  decision: caseInsensitive(['confirmed', 'overridden', 'pending']),
  finalPriority: caseInsensitive(['Critical', 'Review', 'Routine']).optional(),
  reviewer: z.string().optional(),
  notes: z.string().optional(),
  decidedAt: dateish.optional(),
});

export const CxrImageSchema = z.object({
  patient: PatientIdentifiersSchema,
  studyId: z.string().min(1),
  imageId: z.string().optional(),
  acquiredAt: dateish.optional(),
  view: z.string().optional(),
  anomalyScore: z.number().finite().nonnegative(),
  rank: z.number().int().positive(),
  priority: caseInsensitive(['Critical', 'Review', 'Routine']),
  findings: z.string().optional(),
  thumbnail: z.string().optional(),
  heatmap: z.string().optional(),
  radiologistDecision: RadiologistDecisionSchema.optional(),
});

export const CxrBatchSchema = z.object({
  contract: z.literal(CXR_CONTRACT).optional(),
  batchId: z.string().min(1),
  model: ModelSchema,
  runAt: dateish,
  threshold: z.number().optional(),
  source: z.object({ system: z.string().optional(), url: z.string().optional() }).optional(),
  images: z.array(CxrImageSchema).min(1, 'A batch needs at least one image'),
});

export type CxrBatch = z.infer<typeof CxrBatchSchema>;
export type CxrImage = z.infer<typeof CxrImageSchema>;
export type CxrPriority = CxrImage['priority'];

/* ───────────── Module 2 — Chronic-care risk ───────────── */

export const CHRONIC_CONTRACT = 'cura-nexus/chronic-risk@1';
export const OUTREACH_CONTRACT = 'cura-nexus/outreach-outcomes@1';

export const OUTREACH_CHANNELS = ['phone', 'sms', 'whatsapp', 'visit', 'email', 'other'] as const;
export const OUTREACH_OUTCOMES = ['reached', 'no-answer', 'scheduled', 'declined', 'wrong-number', 'completed', 'other'] as const;

export const OutreachOutcomeSchema = z.object({
  channel: caseInsensitive([...OUTREACH_CHANNELS]),
  date: dateish,
  outcome: caseInsensitive([...OUTREACH_OUTCOMES]),
  notes: z.string().optional(),
  by: z.string().optional(),
});

export const FactorSchema = z.object({
  name: z.string().min(1),
  weight: z.number().finite(),
  value: z.union([z.string(), z.number(), z.boolean()]).optional(),
  direction: z.enum(['increases', 'decreases']).optional(),
});

export const ChronicPatientSchema = z.object({
  patient: PatientIdentifiersSchema,
  externalId: z.string().optional(),
  riskScore: z
    .number()
    .finite()
    .min(0)
    .max(100)
    .transform((v) => (v > 1 ? v / 100 : v)),
  tier: caseInsensitive(['High', 'Medium', 'Low']),
  assessedAt: dateish.optional(),
  condition: z.string().optional(),
  factors: z.array(FactorSchema).default([]),
  recommendedAction: z.string().optional(),
  outcomes: z.array(OutreachOutcomeSchema).default([]),
});

export const ChronicBatchSchema = z.object({
  contract: z.literal(CHRONIC_CONTRACT).optional(),
  batchId: z.string().optional(),
  model: ModelSchema,
  generatedAt: dateish,
  source: z.object({ system: z.string().optional(), url: z.string().optional() }).optional(),
  patients: z.array(ChronicPatientSchema).min(1, 'At least one patient result is required'),
});

export type ChronicBatch = z.infer<typeof ChronicBatchSchema>;
export type ChronicPatient = z.infer<typeof ChronicPatientSchema>;
export type ChronicTier = ChronicPatient['tier'];
export type OutreachOutcome = z.infer<typeof OutreachOutcomeSchema>;

export const OutreachExportSchema = z.object({
  contract: z.literal(OUTREACH_CONTRACT),
  exportedAt: dateish,
  source: z.string(),
  outcomes: z.array(
    z.object({
      patient: z.object({ mrn: z.string().optional(), abha: z.string().optional(), name: z.string().optional(), birthDate: z.string().optional(), externalId: z.string().optional() }),
      channel: z.string(),
      date: z.string(),
      outcome: z.string(),
      notes: z.string().optional(),
      recordedBy: z.string().optional(),
      taskId: z.string().optional(),
      communicationId: z.string(),
    }),
  ),
});

export type OutreachExport = z.infer<typeof OutreachExportSchema>;

/** Format zod issues as readable "path: message" strings. */
export function formatZodIssues(error: z.ZodError): string[] {
  return error.issues.map((i) => `${i.path.length ? i.path.join('.') : '(root)'}: ${i.message}`);
}
