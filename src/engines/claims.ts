/**
 * Rule-based claims-denial risk audit: CPT ↔ ICD-10 medical-necessity consistency,
 * demographic edits, prior-authorisation, duplicate billing and modifier checks.
 * Rules are a teaching subset modelled on common payer edits (NCCI-style), not a payer policy.
 */

export interface ServiceItem {
  code: string; // CPT
  name: string;
  price: number; // INR
  category: 'Consultation' | 'Laboratory' | 'Imaging' | 'Procedure' | 'Critical care' | 'Therapy';
  supportingDx?: string[]; // ICD-10 prefixes that establish medical necessity
  sex?: 'male' | 'female';
  priorAuth?: boolean;
  setting?: 'inpatient';
}

export const SERVICE_CATALOG: ServiceItem[] = [
  { code: '99203', name: 'OPD consultation — new patient', price: 1000, category: 'Consultation' },
  { code: '99213', name: 'OPD consultation — follow-up', price: 800, category: 'Consultation' },
  { code: '99223', name: 'Initial hospital care (admission)', price: 2500, category: 'Consultation', setting: 'inpatient' },
  { code: '99291', name: 'Critical care, first hour', price: 6000, category: 'Critical care', setting: 'inpatient' },
  { code: '83036', name: 'HbA1c', price: 550, category: 'Laboratory', supportingDx: ['E10', 'E11', 'E13', 'R73', 'Z13.1'] },
  { code: '82947', name: 'Glucose, quantitative', price: 150, category: 'Laboratory', supportingDx: ['E10', 'E11', 'E13', 'R73', 'Z13.1', 'O24'] },
  { code: '80061', name: 'Lipid panel', price: 700, category: 'Laboratory', supportingDx: ['E78', 'I10', 'I25', 'E11', 'Z13.6', 'K76'] },
  { code: '80053', name: 'Comprehensive metabolic panel', price: 1200, category: 'Laboratory' },
  { code: '82565', name: 'Creatinine', price: 250, category: 'Laboratory', supportingDx: ['N17', 'N18', 'I10', 'E11', 'I50'] },
  { code: '85025', name: 'Complete blood count', price: 350, category: 'Laboratory' },
  { code: '84443', name: 'TSH', price: 450, category: 'Laboratory', supportingDx: ['E03', 'E05', 'E06', 'R63'] },
  { code: '71046', name: 'Chest X-ray, 2 views', price: 600, category: 'Imaging', supportingDx: ['J18', 'J44', 'J45', 'A15', 'R05', 'R06', 'I50', 'R50'] },
  { code: '93000', name: 'Electrocardiogram (12-lead)', price: 400, category: 'Procedure', supportingDx: ['I10', 'I25', 'I48', 'I50', 'R00', 'R07', 'R55'] },
  { code: '93306', name: 'Echocardiogram, complete', price: 3500, category: 'Imaging', supportingDx: ['I50', 'I25', 'I48', 'I35', 'I34', 'R01'], priorAuth: true },
  { code: '94010', name: 'Spirometry', price: 900, category: 'Procedure', supportingDx: ['J44', 'J45', 'R06', 'R05'] },
  { code: '70553', name: 'MRI brain with and without contrast', price: 9000, category: 'Imaging', supportingDx: ['I63', 'G40', 'G43', 'R51', 'C71'], priorAuth: true },
  { code: '74177', name: 'CT abdomen and pelvis with contrast', price: 6500, category: 'Imaging', supportingDx: ['R10', 'K76', 'K80', 'C18', 'N20'], priorAuth: true },
  { code: '59400', name: 'Routine obstetric care (antepartum + delivery)', price: 25000, category: 'Procedure', supportingDx: ['O', 'Z34'], sex: 'female' },
  { code: '55700', name: 'Prostate biopsy', price: 12000, category: 'Procedure', supportingDx: ['R97', 'N40', 'C61'], sex: 'male' },
  { code: '97110', name: 'Physiotherapy — therapeutic exercise', price: 600, category: 'Therapy', supportingDx: ['M17', 'M54', 'I63', 'S'] },
  { code: '90471', name: 'Immunisation administration', price: 200, category: 'Procedure' },
];

export const SERVICE_BY_CODE: Record<string, ServiceItem> = Object.fromEntries(SERVICE_CATALOG.map((s) => [s.code, s]));

export interface ClaimLine {
  code: string;
  date: string;
  quantity: number;
  modifiers?: string[];
}

export interface ClaimInput {
  lines: ClaimLine[];
  diagnoses: string[]; // ICD-10 codes
  patientSex?: 'male' | 'female' | 'other' | 'unknown';
  patientAge?: number;
  encounterClass?: 'AMB' | 'IMP' | 'EMER' | 'VR';
  priorAuthCodes?: string[];
}

export interface ClaimFinding {
  rule: string;
  severity: 'high' | 'medium' | 'low';
  line?: string;
  message: string;
  fix: string;
}

export interface ClaimAudit {
  findings: ClaimFinding[];
  score: number; // 0–100 denial risk
  risk: 'low' | 'medium' | 'high';
}

const WEIGHT = { high: 40, medium: 18, low: 6 } as const;

export function auditClaim(c: ClaimInput): ClaimAudit {
  const findings: ClaimFinding[] = [];
  if (!c.diagnoses.length) {
    findings.push({ rule: 'missing_diagnosis', severity: 'high', message: 'No ICD-10 diagnosis on the claim.', fix: 'Attach at least one diagnosis supporting each service.' });
  }
  const unspecified = c.diagnoses.filter((d) => /^(R69|R68\.89|R99|Z00\.0)/.test(d));
  for (const d of unspecified) {
    findings.push({ rule: 'unspecified_diagnosis', severity: 'low', message: `${d} is non-specific and frequently queried by payers.`, fix: 'Code to the highest specificity documented.' });
  }
  const seen = new Map<string, number>();
  for (const line of c.lines) {
    const svc = SERVICE_BY_CODE[line.code];
    if (!svc) {
      findings.push({ rule: 'unknown_code', severity: 'high', line: line.code, message: `CPT ${line.code} is not in the service catalogue.`, fix: 'Correct the procedure code.' });
      continue;
    }
    if (svc.supportingDx && c.diagnoses.length && !c.diagnoses.some((d) => svc.supportingDx!.some((p) => d.startsWith(p)))) {
      findings.push({
        rule: 'medical_necessity',
        severity: 'high',
        line: line.code,
        message: `${svc.name} (${svc.code}) is not supported by the listed diagnoses.`,
        fix: `Add a supporting diagnosis (e.g. ${svc.supportingDx.slice(0, 3).join(', ')}) if documented, or remove the line.`,
      });
    }
    if (svc.sex && c.patientSex && c.patientSex !== svc.sex && (c.patientSex === 'male' || c.patientSex === 'female')) {
      findings.push({ rule: 'sex_mismatch', severity: 'high', line: line.code, message: `${svc.name} is a ${svc.sex}-only service but the patient is ${c.patientSex}.`, fix: 'Verify the patient and the procedure code.' });
    }
    if (svc.code === '59400' && (c.patientAge ?? 0) > 55) {
      findings.push({ rule: 'age_edit', severity: 'medium', line: line.code, message: 'Obstetric care for a patient over 55 triggers a manual review.', fix: 'Confirm the patient demographics.' });
    }
    if (svc.priorAuth && !c.priorAuthCodes?.includes(svc.code)) {
      findings.push({ rule: 'prior_auth', severity: 'high', line: line.code, message: `${svc.name} requires prior authorisation, none recorded.`, fix: 'Obtain and record the pre-authorisation number before submission.' });
    }
    if (svc.setting === 'inpatient' && c.encounterClass && c.encounterClass !== 'IMP') {
      findings.push({ rule: 'setting_mismatch', severity: 'medium', line: line.code, message: `${svc.name} is billed for a non-inpatient encounter.`, fix: 'Use an outpatient E/M code or correct the encounter class.' });
    }
    if (c.encounterClass === 'VR' && svc.category === 'Consultation' && !line.modifiers?.includes('95')) {
      findings.push({ rule: 'telehealth_modifier', severity: 'medium', line: line.code, message: 'Virtual consultation billed without modifier 95.', fix: 'Append modifier 95 to telehealth E/M lines.' });
    }
    const key = `${line.code}|${line.date}`;
    seen.set(key, (seen.get(key) ?? 0) + line.quantity);
    if ((seen.get(key) ?? 0) > 1 && !line.modifiers?.some((m) => m === '59' || m === '76')) {
      findings.push({ rule: 'duplicate_line', severity: 'medium', line: line.code, message: `${svc.name} billed more than once on ${line.date}.`, fix: 'Remove the duplicate or add modifier 59/76 with documentation.' });
    }
  }
  const diagMale = c.diagnoses.some((d) => d.startsWith('O') || d.startsWith('Z34'));
  if (diagMale && c.patientSex === 'male') {
    findings.push({ rule: 'dx_sex_mismatch', severity: 'high', message: 'Pregnancy-related diagnosis on a male patient.', fix: 'Verify the diagnosis code and patient.' });
  }
  const score = Math.min(100, findings.reduce((s, f) => s + WEIGHT[f.severity], 0));
  const risk = score >= 60 || findings.some((f) => f.severity === 'high') ? 'high' : score >= 18 ? 'medium' : 'low';
  return { findings, score, risk };
}
