/**
 * Small embedded terminology set (LOINC, SNOMED CT, ICD-10 (WHO), RxNorm, HL7 code systems).
 * Curated for this demo; verify against the official terminology servers before any clinical use.
 */
import type { CodeableConcept, Coding } from './types';

export const SYS = {
  loinc: 'http://loinc.org',
  snomed: 'http://snomed.info/sct',
  icd10: 'http://hl7.org/fhir/sid/icd-10',
  rxnorm: 'http://www.nlm.nih.gov/research/umls/rxnorm',
  ucum: 'http://unitsofmeasure.org',
  actCode: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
  actReason: 'http://terminology.hl7.org/CodeSystem/v3-ActReason',
  obsCategory: 'http://terminology.hl7.org/CodeSystem/observation-category',
  obsInterp: 'http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation',
  condClinical: 'http://terminology.hl7.org/CodeSystem/condition-clinical',
  condVerification: 'http://terminology.hl7.org/CodeSystem/condition-ver-status',
  condCategory: 'http://terminology.hl7.org/CodeSystem/condition-category',
  allergyClinical: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical',
  allergyVerification: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-verification',
  consentScope: 'http://terminology.hl7.org/CodeSystem/consentscope',
  consentAction: 'http://terminology.hl7.org/CodeSystem/consentaction',
  participationType: 'http://terminology.hl7.org/CodeSystem/v3-ParticipationType',
  provenanceAgent: 'http://terminology.hl7.org/CodeSystem/provenance-participant-type',
  dataOperation: 'http://terminology.hl7.org/CodeSystem/v3-DataOperation',
  auditType: 'http://terminology.hl7.org/CodeSystem/audit-event-type',
  restful: 'http://hl7.org/fhir/restful-interaction',
  dicomDcm: 'http://dicom.nema.org/resources/ontology/DCM',
  flagCategory: 'http://terminology.hl7.org/CodeSystem/flag-category',
  riskProbability: 'http://terminology.hl7.org/CodeSystem/risk-probability',
  diagnosticService: 'http://terminology.hl7.org/CodeSystem/v2-0074',
  identifierType: 'http://terminology.hl7.org/CodeSystem/v2-0203',
  resourceTypes: 'http://hl7.org/fhir/resource-types',
  communicationCategory: 'http://terminology.hl7.org/CodeSystem/communication-category',
  participationMode: 'http://terminology.hl7.org/CodeSystem/v3-ParticipationMode',
  // Local systems for Cura Nexus-specific concepts
  cura: 'https://cura-nexus.local/fhir/CodeSystem/cura',
  curaRisk: 'https://cura-nexus.local/fhir/CodeSystem/risk-models',
  mrn: 'https://cura-nexus.local/fhir/sid/mrn',
  abha: 'https://healthid.ndhm.gov.in',
  abhaAddress: 'https://healthid.ndhm.gov.in/abha-address',
  module1: 'https://cura-nexus.local/fhir/sid/module1-cxr',
  module2: 'https://cura-nexus.local/fhir/sid/module2-chronic',
  sourceRecord: 'https://cura-nexus.local/fhir/sid/source-record',
} as const;

export const EXT = {
  contributingFactor: 'https://cura-nexus.local/fhir/StructureDefinition/contributing-factor',
  conformalInterval: 'https://cura-nexus.local/fhir/StructureDefinition/conformal-interval',
  clinicianOverride: 'https://cura-nexus.local/fhir/StructureDefinition/clinician-override',
  sourceSystem: 'https://cura-nexus.local/fhir/StructureDefinition/source-system',
  cxrRank: 'https://cura-nexus.local/fhir/StructureDefinition/cxr-rank',
  cxrPriority: 'https://cura-nexus.local/fhir/StructureDefinition/cxr-priority',
  batchId: 'https://cura-nexus.local/fhir/StructureDefinition/batch-id',
  modelVersion: 'https://cura-nexus.local/fhir/StructureDefinition/model-version',
  recommendedAction: 'https://cura-nexus.local/fhir/StructureDefinition/recommended-action',
  dataQuality: 'https://cura-nexus.local/fhir/StructureDefinition/data-quality-flag',
  outreachOutcome: 'https://cura-nexus.local/fhir/StructureDefinition/outreach-outcome',
} as const;

export interface ObservationCode {
  code: string;
  display: string;
  short: string;
  unit: string;
  ucum: string;
  category: 'vital-signs' | 'laboratory' | 'survey' | 'imaging' | 'exam';
  /** Physiologically plausible range — values outside are quarantined by the data pipeline. */
  plausible: [number, number];
  /** Typical adult reference range used for interpretation flags. */
  normal?: [number, number];
  decimals: number;
}

export const OBS: Record<string, ObservationCode> = {
  sbp: { code: '8480-6', display: 'Systolic blood pressure', short: 'SBP', unit: 'mmHg', ucum: 'mm[Hg]', category: 'vital-signs', plausible: [50, 280], normal: [90, 130], decimals: 0 },
  dbp: { code: '8462-4', display: 'Diastolic blood pressure', short: 'DBP', unit: 'mmHg', ucum: 'mm[Hg]', category: 'vital-signs', plausible: [25, 180], normal: [60, 85], decimals: 0 },
  hr: { code: '8867-4', display: 'Heart rate', short: 'HR', unit: '/min', ucum: '/min', category: 'vital-signs', plausible: [20, 250], normal: [60, 100], decimals: 0 },
  rr: { code: '9279-1', display: 'Respiratory rate', short: 'RR', unit: '/min', ucum: '/min', category: 'vital-signs', plausible: [4, 70], normal: [12, 20], decimals: 0 },
  temp: { code: '8310-5', display: 'Body temperature', short: 'Temp', unit: '°C', ucum: 'Cel', category: 'vital-signs', plausible: [30, 44], normal: [36.1, 37.5], decimals: 1 },
  spo2: { code: '59408-5', display: 'Oxygen saturation in Arterial blood by Pulse oximetry', short: 'SpO₂', unit: '%', ucum: '%', category: 'vital-signs', plausible: [50, 100], normal: [95, 100], decimals: 0 },
  weight: { code: '29463-7', display: 'Body weight', short: 'Weight', unit: 'kg', ucum: 'kg', category: 'vital-signs', plausible: [2, 300], decimals: 1 },
  height: { code: '8302-2', display: 'Body height', short: 'Height', unit: 'cm', ucum: 'cm', category: 'vital-signs', plausible: [40, 230], decimals: 0 },
  bmi: { code: '39156-5', display: 'Body mass index (BMI) [Ratio]', short: 'BMI', unit: 'kg/m²', ucum: 'kg/m2', category: 'vital-signs', plausible: [10, 80], normal: [18.5, 24.9], decimals: 1 },
  hba1c: { code: '4548-4', display: 'Hemoglobin A1c/Hemoglobin.total in Blood', short: 'HbA1c', unit: '%', ucum: '%', category: 'laboratory', plausible: [3, 20], normal: [4, 5.6], decimals: 1 },
  glucose: { code: '1558-6', display: 'Fasting glucose [Mass/volume] in Serum or Plasma', short: 'FPG', unit: 'mg/dL', ucum: 'mg/dL', category: 'laboratory', plausible: [20, 900], normal: [70, 99], decimals: 0 },
  creatinine: { code: '2160-0', display: 'Creatinine [Mass/volume] in Serum or Plasma', short: 'Creatinine', unit: 'mg/dL', ucum: 'mg/dL', category: 'laboratory', plausible: [0.1, 20], normal: [0.6, 1.2], decimals: 2 },
  egfr: { code: '98979-8', display: 'Glomerular filtration rate/1.73 sq M.predicted (CKD-EPI 2021)', short: 'eGFR', unit: 'mL/min/1.73m²', ucum: 'mL/min/{1.73_m2}', category: 'laboratory', plausible: [2, 200], normal: [90, 140], decimals: 0 },
  tchol: { code: '2093-3', display: 'Cholesterol [Mass/volume] in Serum or Plasma', short: 'Total chol', unit: 'mg/dL', ucum: 'mg/dL', category: 'laboratory', plausible: [50, 600], normal: [120, 200], decimals: 0 },
  hdl: { code: '2085-9', display: 'Cholesterol in HDL [Mass/volume] in Serum or Plasma', short: 'HDL', unit: 'mg/dL', ucum: 'mg/dL', category: 'laboratory', plausible: [5, 150], normal: [40, 90], decimals: 0 },
  ldl: { code: '13457-7', display: 'Cholesterol in LDL [Mass/volume] in Serum or Plasma by calculation', short: 'LDL', unit: 'mg/dL', ucum: 'mg/dL', category: 'laboratory', plausible: [10, 400], normal: [50, 100], decimals: 0 },
  ast: { code: '1920-8', display: 'Aspartate aminotransferase [Enzymatic activity/volume] in Serum or Plasma', short: 'AST', unit: 'U/L', ucum: 'U/L', category: 'laboratory', plausible: [3, 5000], normal: [8, 40], decimals: 0 },
  alt: { code: '1742-6', display: 'Alanine aminotransferase [Enzymatic activity/volume] in Serum or Plasma', short: 'ALT', unit: 'U/L', ucum: 'U/L', category: 'laboratory', plausible: [3, 5000], normal: [7, 56], decimals: 0 },
  platelets: { code: '777-3', display: 'Platelets [#/volume] in Blood by Automated count', short: 'Platelets', unit: '10⁹/L', ucum: '10*9/L', category: 'laboratory', plausible: [5, 1500], normal: [150, 410], decimals: 0 },
  hb: { code: '718-7', display: 'Hemoglobin [Mass/volume] in Blood', short: 'Hb', unit: 'g/dL', ucum: 'g/dL', category: 'laboratory', plausible: [2, 25], normal: [12, 17], decimals: 1 },
  uacr: { code: '14959-1', display: 'Microalbumin/Creatinine [Mass Ratio] in Urine', short: 'UACR', unit: 'mg/g', ucum: 'mg/g', category: 'laboratory', plausible: [0, 5000], normal: [0, 30], decimals: 0 },
  fev1fvc: { code: '19926-5', display: 'FEV1/FVC', short: 'FEV1/FVC', unit: '%', ucum: '%', category: 'exam', plausible: [20, 100], normal: [70, 90], decimals: 0 },
};

export const OBS_BY_LOINC: Record<string, ObservationCode & { key: string }> = Object.fromEntries(
  Object.entries(OBS).map(([key, v]) => [v.code, { ...v, key }]),
);

export const BP_PANEL = { code: '85354-9', display: 'Blood pressure panel with all children optional' };

export interface ConditionCode {
  key: string;
  snomed: string;
  icd10: string;
  display: string;
  chronic: boolean;
}

export const CONDITIONS: ConditionCode[] = [
  { key: 't2dm', snomed: '44054006', icd10: 'E11.9', display: 'Type 2 diabetes mellitus', chronic: true },
  { key: 'htn', snomed: '38341003', icd10: 'I10', display: 'Essential hypertension', chronic: true },
  { key: 'ckd', snomed: '709044004', icd10: 'N18.3', display: 'Chronic kidney disease', chronic: true },
  { key: 'copd', snomed: '13645005', icd10: 'J44.9', display: 'Chronic obstructive pulmonary disease', chronic: true },
  { key: 'asthma', snomed: '195967001', icd10: 'J45.9', display: 'Asthma', chronic: true },
  { key: 'cad', snomed: '53741008', icd10: 'I25.1', display: 'Coronary artery disease', chronic: true },
  { key: 'hypothyroid', snomed: '40930008', icd10: 'E03.9', display: 'Hypothyroidism', chronic: true },
  { key: 'nafld', snomed: '197321007', icd10: 'K76.0', display: 'Fatty liver (NAFLD)', chronic: true },
  { key: 'hf', snomed: '84114007', icd10: 'I50.9', display: 'Heart failure', chronic: true },
  { key: 'af', snomed: '49436004', icd10: 'I48', display: 'Atrial fibrillation', chronic: true },
  { key: 'hld', snomed: '55822004', icd10: 'E78.5', display: 'Hyperlipidaemia', chronic: true },
  { key: 'obesity', snomed: '414916001', icd10: 'E66.9', display: 'Obesity', chronic: true },
  { key: 'stroke', snomed: '230690007', icd10: 'I63.9', display: 'Cerebrovascular accident', chronic: false },
  { key: 'depression', snomed: '35489007', icd10: 'F32.9', display: 'Depressive disorder', chronic: true },
  { key: 'tb', snomed: '56717001', icd10: 'A15.0', display: 'Pulmonary tuberculosis', chronic: false },
  { key: 'pneumonia', snomed: '233604007', icd10: 'J18.9', display: 'Pneumonia', chronic: false },
  { key: 'anaemia', snomed: '271737000', icd10: 'D64.9', display: 'Anaemia', chronic: false },
  { key: 'oa', snomed: '396275006', icd10: 'M17.9', display: 'Osteoarthritis of knee', chronic: true },
];

export const CONDITION_BY_KEY: Record<string, ConditionCode> = Object.fromEntries(CONDITIONS.map((c) => [c.key, c]));

export interface DrugCode {
  key: string;
  rxnorm: string;
  name: string;
  /** Pharmacological class used by interaction and allergy cross-reactivity rules. */
  classes: string[];
  defaultDose: string;
}

export const DRUGS: DrugCode[] = [
  { key: 'metformin', rxnorm: '6809', name: 'Metformin', classes: ['biguanide'], defaultDose: '500 mg twice daily' },
  { key: 'glimepiride', rxnorm: '25789', name: 'Glimepiride', classes: ['sulfonylurea'], defaultDose: '1 mg once daily' },
  { key: 'sitagliptin', rxnorm: '593411', name: 'Sitagliptin', classes: ['dpp4'], defaultDose: '100 mg once daily' },
  { key: 'empagliflozin', rxnorm: '1545653', name: 'Empagliflozin', classes: ['sglt2'], defaultDose: '10 mg once daily' },
  { key: 'insulin_glargine', rxnorm: '274783', name: 'Insulin glargine', classes: ['insulin'], defaultDose: '10 units at night' },
  { key: 'amlodipine', rxnorm: '17767', name: 'Amlodipine', classes: ['ccb'], defaultDose: '5 mg once daily' },
  { key: 'telmisartan', rxnorm: '73494', name: 'Telmisartan', classes: ['arb'], defaultDose: '40 mg once daily' },
  { key: 'losartan', rxnorm: '52175', name: 'Losartan', classes: ['arb'], defaultDose: '50 mg once daily' },
  { key: 'lisinopril', rxnorm: '29046', name: 'Lisinopril', classes: ['acei'], defaultDose: '10 mg once daily' },
  { key: 'metoprolol', rxnorm: '6918', name: 'Metoprolol', classes: ['beta_blocker'], defaultDose: '25 mg twice daily' },
  { key: 'furosemide', rxnorm: '4603', name: 'Furosemide', classes: ['loop_diuretic'], defaultDose: '40 mg once daily' },
  { key: 'spironolactone', rxnorm: '9997', name: 'Spironolactone', classes: ['k_sparing'], defaultDose: '25 mg once daily' },
  { key: 'atorvastatin', rxnorm: '83367', name: 'Atorvastatin', classes: ['statin'], defaultDose: '20 mg at night' },
  { key: 'rosuvastatin', rxnorm: '301542', name: 'Rosuvastatin', classes: ['statin'], defaultDose: '10 mg at night' },
  { key: 'simvastatin', rxnorm: '36567', name: 'Simvastatin', classes: ['statin'], defaultDose: '20 mg at night' },
  { key: 'aspirin', rxnorm: '1191', name: 'Aspirin', classes: ['nsaid', 'antiplatelet', 'salicylate'], defaultDose: '75 mg once daily' },
  { key: 'clopidogrel', rxnorm: '32968', name: 'Clopidogrel', classes: ['antiplatelet', 'p2y12'], defaultDose: '75 mg once daily' },
  { key: 'warfarin', rxnorm: '11289', name: 'Warfarin', classes: ['anticoagulant', 'vka'], defaultDose: '5 mg once daily (INR-guided)' },
  { key: 'digoxin', rxnorm: '3407', name: 'Digoxin', classes: ['cardiac_glycoside'], defaultDose: '0.125 mg once daily' },
  { key: 'amiodarone', rxnorm: '703', name: 'Amiodarone', classes: ['antiarrhythmic', 'cyp3a4_inhibitor'], defaultDose: '200 mg once daily' },
  { key: 'levothyroxine', rxnorm: '10582', name: 'Levothyroxine', classes: ['thyroid'], defaultDose: '50 mcg before breakfast' },
  { key: 'salbutamol', rxnorm: '435', name: 'Salbutamol inhaler', classes: ['saba'], defaultDose: '2 puffs as needed' },
  { key: 'tiotropium', rxnorm: '69120', name: 'Tiotropium inhaler', classes: ['lama'], defaultDose: '18 mcg once daily' },
  { key: 'budesonide', rxnorm: '19831', name: 'Budesonide inhaler', classes: ['ics'], defaultDose: '200 mcg twice daily' },
  { key: 'omeprazole', rxnorm: '7646', name: 'Omeprazole', classes: ['ppi', 'cyp2c19_inhibitor'], defaultDose: '20 mg before breakfast' },
  { key: 'pantoprazole', rxnorm: '40790', name: 'Pantoprazole', classes: ['ppi'], defaultDose: '40 mg before breakfast' },
  { key: 'paracetamol', rxnorm: '161', name: 'Paracetamol', classes: ['analgesic'], defaultDose: '500 mg up to four times daily' },
  { key: 'ibuprofen', rxnorm: '5640', name: 'Ibuprofen', classes: ['nsaid'], defaultDose: '400 mg three times daily' },
  { key: 'diclofenac', rxnorm: '3355', name: 'Diclofenac', classes: ['nsaid'], defaultDose: '50 mg twice daily' },
  { key: 'codeine', rxnorm: '2670', name: 'Codeine', classes: ['opioid'], defaultDose: '30 mg every 6 hours as needed' },
  { key: 'tramadol', rxnorm: '10689', name: 'Tramadol', classes: ['opioid', 'serotonergic'], defaultDose: '50 mg every 8 hours as needed' },
  { key: 'amoxicillin', rxnorm: '723', name: 'Amoxicillin', classes: ['penicillin', 'beta_lactam'], defaultDose: '500 mg three times daily' },
  { key: 'azithromycin', rxnorm: '18631', name: 'Azithromycin', classes: ['macrolide'], defaultDose: '500 mg once daily for 3 days' },
  { key: 'clarithromycin', rxnorm: '21212', name: 'Clarithromycin', classes: ['macrolide', 'cyp3a4_inhibitor'], defaultDose: '500 mg twice daily' },
  { key: 'ciprofloxacin', rxnorm: '2551', name: 'Ciprofloxacin', classes: ['fluoroquinolone'], defaultDose: '500 mg twice daily' },
  { key: 'cotrimoxazole', rxnorm: '10831', name: 'Co-trimoxazole', classes: ['sulfonamide'], defaultDose: '960 mg twice daily' },
  { key: 'cefuroxime', rxnorm: '2194', name: 'Cefuroxime', classes: ['cephalosporin', 'beta_lactam'], defaultDose: '500 mg twice daily' },
  { key: 'fluconazole', rxnorm: '4450', name: 'Fluconazole', classes: ['azole', 'cyp2c9_inhibitor'], defaultDose: '150 mg single dose' },
  { key: 'sertraline', rxnorm: '36437', name: 'Sertraline', classes: ['ssri', 'serotonergic'], defaultDose: '50 mg once daily' },
  { key: 'fluoxetine', rxnorm: '4493', name: 'Fluoxetine', classes: ['ssri', 'serotonergic', 'cyp2d6_inhibitor'], defaultDose: '20 mg once daily' },
  { key: 'prednisolone', rxnorm: '8638', name: 'Prednisolone', classes: ['corticosteroid'], defaultDose: '20 mg once daily' },
  { key: 'allopurinol', rxnorm: '519', name: 'Allopurinol', classes: ['xanthine_oxidase'], defaultDose: '100 mg once daily' },
  { key: 'sildenafil', rxnorm: '136411', name: 'Sildenafil', classes: ['pde5'], defaultDose: '50 mg as needed' },
  { key: 'nitroglycerin', rxnorm: '4917', name: 'Glyceryl trinitrate', classes: ['nitrate'], defaultDose: '0.4 mg sublingual as needed' },
  { key: 'potassium_chloride', rxnorm: '8591', name: 'Potassium chloride', classes: ['potassium'], defaultDose: '600 mg twice daily' },
  { key: 'fluorouracil', rxnorm: '4492', name: 'Fluorouracil', classes: ['fluoropyrimidine'], defaultDose: 'Per oncology protocol' },
  { key: 'capecitabine', rxnorm: '194000', name: 'Capecitabine', classes: ['fluoropyrimidine'], defaultDose: 'Per oncology protocol' },
];

export const DRUG_BY_KEY: Record<string, DrugCode> = Object.fromEntries(DRUGS.map((d) => [d.key, d]));
export const DRUG_BY_RXNORM: Record<string, DrugCode> = Object.fromEntries(DRUGS.map((d) => [d.rxnorm, d]));

export interface AllergenCode {
  key: string;
  snomed: string;
  display: string;
  category: 'medication' | 'food' | 'environment';
  /** Drug classes that cross-react with this allergen. */
  crossClasses: string[];
}

export const ALLERGENS: AllergenCode[] = [
  { key: 'penicillin', snomed: '764146007', display: 'Penicillin', category: 'medication', crossClasses: ['penicillin', 'beta_lactam'] },
  { key: 'sulfonamide', snomed: '387406002', display: 'Sulfonamide', category: 'medication', crossClasses: ['sulfonamide'] },
  { key: 'aspirin', snomed: '387458008', display: 'Aspirin', category: 'medication', crossClasses: ['salicylate', 'nsaid'] },
  { key: 'nsaid', snomed: '387207008', display: 'Ibuprofen (NSAID)', category: 'medication', crossClasses: ['nsaid'] },
  { key: 'codeine', snomed: '387494007', display: 'Codeine', category: 'medication', crossClasses: ['opioid'] },
  { key: 'contrast', snomed: '293637006', display: 'Iodinated contrast media', category: 'medication', crossClasses: [] },
  { key: 'peanut', snomed: '256349002', display: 'Peanut', category: 'food', crossClasses: [] },
  { key: 'shellfish', snomed: '227037002', display: 'Shellfish', category: 'food', crossClasses: [] },
  { key: 'latex', snomed: '111088007', display: 'Latex', category: 'environment', crossClasses: [] },
  { key: 'dust', snomed: '260147004', display: 'House dust mite', category: 'environment', crossClasses: [] },
];

export const ALLERGEN_BY_KEY: Record<string, AllergenCode> = Object.fromEntries(ALLERGENS.map((a) => [a.key, a]));

export const DOC_TYPES = {
  discharge: { system: SYS.loinc, code: '18842-5', display: 'Discharge summary' },
  nurseNote: { system: SYS.loinc, code: '34746-8', display: 'Nurse note' },
  consultNote: { system: SYS.loinc, code: '11488-4', display: 'Consult note' },
  summary: { system: SYS.loinc, code: '60591-5', display: 'Patient summary Document' },
  ccd: { system: SYS.loinc, code: '34133-9', display: 'Summary of episode note' },
  cxrReport: { system: SYS.loinc, code: '36643-5', display: 'XR Chest 2 Views' },
} as const;

export const PURPOSES = [
  { code: 'TREAT', display: 'Treatment' },
  { code: 'ETREAT', display: 'Emergency treatment' },
  { code: 'HPAYMT', display: 'Healthcare payment' },
  { code: 'HRESCH', display: 'Healthcare research' },
  { code: 'PATRQT', display: 'Patient requested' },
] as const;

export type PurposeCode = (typeof PURPOSES)[number]['code'];

export const ENCOUNTER_CLASS = {
  AMB: { system: SYS.actCode, code: 'AMB', display: 'ambulatory' },
  IMP: { system: SYS.actCode, code: 'IMP', display: 'inpatient encounter' },
  EMER: { system: SYS.actCode, code: 'EMER', display: 'emergency' },
  VR: { system: SYS.actCode, code: 'VR', display: 'virtual' },
  HH: { system: SYS.actCode, code: 'HH', display: 'home health' },
} as const;

/** Known code systems — used by the validator to flag unknown systems as warnings. */
export const KNOWN_SYSTEMS = new Set<string>(Object.values(SYS));

export function cc(system: string, code: string, display: string, text?: string): CodeableConcept {
  return { coding: [{ system, code, display }], text: text ?? display };
}

export function coding(system: string, code: string, display?: string): Coding {
  return display ? { system, code, display } : { system, code };
}

export function conceptForObservation(key: keyof typeof OBS | string): CodeableConcept {
  const o = OBS[key];
  if (!o) throw new Error(`Unknown observation key ${key}`);
  return cc(SYS.loinc, o.code, o.display, o.short);
}

export function conceptForCondition(c: ConditionCode): CodeableConcept {
  return {
    coding: [
      { system: SYS.snomed, code: c.snomed, display: c.display },
      { system: SYS.icd10, code: c.icd10, display: c.display },
    ],
    text: c.display,
  };
}

export function conceptForDrug(d: DrugCode): CodeableConcept {
  return cc(SYS.rxnorm, d.rxnorm, d.name);
}

/** First coding matching a system, or the first coding. */
export function codeOf(concept: CodeableConcept | undefined, system?: string): Coding | undefined {
  if (!concept?.coding?.length) return undefined;
  return system ? concept.coding.find((c) => c.system === system) : concept.coding[0];
}

export function conceptText(concept: CodeableConcept | undefined): string {
  if (!concept) return '—';
  return concept.text ?? concept.coding?.[0]?.display ?? concept.coding?.[0]?.code ?? '—';
}
