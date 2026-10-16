/**
 * FHIR R4 resource model (the subset Cura Nexus uses).
 * Field names, cardinalities and value sets follow https://hl7.org/fhir/R4/ — optional
 * elements we never populate are omitted to keep the types readable.
 */

export interface Coding {
  system?: string;
  version?: string;
  code?: string;
  display?: string;
}

export interface CodeableConcept {
  coding?: Coding[];
  text?: string;
}

export interface Reference {
  reference?: string;
  type?: string;
  display?: string;
  identifier?: Identifier;
}

export interface Identifier {
  use?: 'usual' | 'official' | 'temp' | 'secondary' | 'old';
  type?: CodeableConcept;
  system?: string;
  value?: string;
  assigner?: Reference;
}

export interface Period {
  start?: string;
  end?: string;
}

export interface Quantity {
  value?: number;
  unit?: string;
  system?: string;
  code?: string;
  comparator?: '<' | '<=' | '>=' | '>';
}

export interface Range {
  low?: Quantity;
  high?: Quantity;
}

export interface HumanName {
  use?: 'usual' | 'official' | 'temp' | 'nickname' | 'anonymous' | 'old' | 'maiden';
  text?: string;
  family?: string;
  given?: string[];
  prefix?: string[];
}

export interface ContactPoint {
  system?: 'phone' | 'fax' | 'email' | 'pager' | 'url' | 'sms' | 'other';
  value?: string;
  use?: 'home' | 'work' | 'temp' | 'old' | 'mobile';
}

export interface Address {
  use?: 'home' | 'work' | 'temp' | 'old' | 'billing';
  text?: string;
  line?: string[];
  city?: string;
  district?: string;
  state?: string;
  postalCode?: string;
  country?: string;
}

export interface Annotation {
  authorString?: string;
  authorReference?: Reference;
  time?: string;
  text: string;
}

export interface Attachment {
  contentType?: string;
  language?: string;
  data?: string;
  url?: string;
  title?: string;
  creation?: string;
  size?: number;
  hash?: string;
}

export interface Extension {
  url: string;
  valueString?: string;
  valueDecimal?: number;
  valueInteger?: number;
  valueBoolean?: boolean;
  valueCode?: string;
  valueDateTime?: string;
  valueReference?: Reference;
  valueCodeableConcept?: CodeableConcept;
  extension?: Extension[];
}

export interface Meta {
  versionId?: string;
  lastUpdated?: string;
  source?: string;
  profile?: string[];
  tag?: Coding[];
}

export interface Narrative {
  status: 'generated' | 'extensions' | 'additional' | 'empty';
  div: string;
}

export interface ResourceBase {
  resourceType: string;
  id?: string;
  meta?: Meta;
  text?: Narrative;
  extension?: Extension[];
}

export interface Patient extends ResourceBase {
  resourceType: 'Patient';
  identifier?: Identifier[];
  active?: boolean;
  name?: HumanName[];
  telecom?: ContactPoint[];
  gender?: 'male' | 'female' | 'other' | 'unknown';
  birthDate?: string;
  deceasedBoolean?: boolean;
  address?: Address[];
  maritalStatus?: CodeableConcept;
  communication?: { language: CodeableConcept; preferred?: boolean }[];
  generalPractitioner?: Reference[];
  managingOrganization?: Reference;
  link?: { other: Reference; type: 'replaced-by' | 'replaces' | 'refer' | 'seealso' }[];
  contact?: { relationship?: CodeableConcept[]; name?: HumanName; telecom?: ContactPoint[] }[];
}

export interface Practitioner extends ResourceBase {
  resourceType: 'Practitioner';
  identifier?: Identifier[];
  active?: boolean;
  name?: HumanName[];
  telecom?: ContactPoint[];
  gender?: 'male' | 'female' | 'other' | 'unknown';
  qualification?: { code: CodeableConcept }[];
}

export interface Organization extends ResourceBase {
  resourceType: 'Organization';
  identifier?: Identifier[];
  active?: boolean;
  type?: CodeableConcept[];
  name?: string;
  telecom?: ContactPoint[];
  address?: Address[];
}

export interface Encounter extends ResourceBase {
  resourceType: 'Encounter';
  identifier?: Identifier[];
  status: 'planned' | 'arrived' | 'triaged' | 'in-progress' | 'onleave' | 'finished' | 'cancelled' | 'entered-in-error' | 'unknown';
  class: Coding;
  type?: CodeableConcept[];
  priority?: CodeableConcept;
  subject?: Reference;
  participant?: { individual?: Reference; type?: CodeableConcept[] }[];
  period?: Period;
  reasonCode?: CodeableConcept[];
  diagnosis?: { condition: Reference; rank?: number }[];
  hospitalization?: { admitSource?: CodeableConcept; dischargeDisposition?: CodeableConcept };
  location?: { location: Reference; status?: 'planned' | 'active' | 'reserved' | 'completed'; period?: Period }[];
  serviceProvider?: Reference;
}

export interface ObservationComponent {
  code: CodeableConcept;
  valueQuantity?: Quantity;
  valueString?: string;
  valueCodeableConcept?: CodeableConcept;
  interpretation?: CodeableConcept[];
}

export interface Observation extends ResourceBase {
  resourceType: 'Observation';
  identifier?: Identifier[];
  status: 'registered' | 'preliminary' | 'final' | 'amended' | 'corrected' | 'cancelled' | 'entered-in-error' | 'unknown';
  category?: CodeableConcept[];
  code: CodeableConcept;
  subject?: Reference;
  encounter?: Reference;
  effectiveDateTime?: string;
  issued?: string;
  performer?: Reference[];
  valueQuantity?: Quantity;
  valueString?: string;
  valueCodeableConcept?: CodeableConcept;
  valueBoolean?: boolean;
  interpretation?: CodeableConcept[];
  note?: Annotation[];
  referenceRange?: { low?: Quantity; high?: Quantity; text?: string }[];
  component?: ObservationComponent[];
  derivedFrom?: Reference[];
  device?: Reference;
}

export interface Condition extends ResourceBase {
  resourceType: 'Condition';
  identifier?: Identifier[];
  clinicalStatus?: CodeableConcept;
  verificationStatus?: CodeableConcept;
  category?: CodeableConcept[];
  severity?: CodeableConcept;
  code?: CodeableConcept;
  subject: Reference;
  encounter?: Reference;
  onsetDateTime?: string;
  abatementDateTime?: string;
  recordedDate?: string;
  recorder?: Reference;
  note?: Annotation[];
}

export interface Dosage {
  text?: string;
  timing?: { repeat?: { frequency?: number; period?: number; periodUnit?: 's' | 'min' | 'h' | 'd' | 'wk' | 'mo' | 'a' }; code?: CodeableConcept };
  route?: CodeableConcept;
  doseAndRate?: { doseQuantity?: Quantity }[];
}

export interface MedicationRequest extends ResourceBase {
  resourceType: 'MedicationRequest';
  identifier?: Identifier[];
  status: 'active' | 'on-hold' | 'cancelled' | 'completed' | 'entered-in-error' | 'stopped' | 'draft' | 'unknown';
  intent: 'proposal' | 'plan' | 'order' | 'original-order' | 'reflex-order' | 'filler-order' | 'instance-order' | 'option';
  medicationCodeableConcept?: CodeableConcept;
  subject: Reference;
  encounter?: Reference;
  authoredOn?: string;
  requester?: Reference;
  reasonCode?: CodeableConcept[];
  note?: Annotation[];
  dosageInstruction?: Dosage[];
  dispenseRequest?: { numberOfRepeatsAllowed?: number; quantity?: Quantity; expectedSupplyDuration?: Quantity };
}

export interface AllergyIntolerance extends ResourceBase {
  resourceType: 'AllergyIntolerance';
  identifier?: Identifier[];
  clinicalStatus?: CodeableConcept;
  verificationStatus?: CodeableConcept;
  type?: 'allergy' | 'intolerance';
  category?: ('food' | 'medication' | 'environment' | 'biologic')[];
  criticality?: 'low' | 'high' | 'unable-to-assess';
  code?: CodeableConcept;
  patient: Reference;
  recordedDate?: string;
  reaction?: { manifestation: CodeableConcept[]; severity?: 'mild' | 'moderate' | 'severe' }[];
}

export interface DiagnosticReport extends ResourceBase {
  resourceType: 'DiagnosticReport';
  identifier?: Identifier[];
  basedOn?: Reference[];
  status: 'registered' | 'partial' | 'preliminary' | 'final' | 'amended' | 'corrected' | 'appended' | 'cancelled' | 'entered-in-error' | 'unknown';
  category?: CodeableConcept[];
  code: CodeableConcept;
  subject?: Reference;
  encounter?: Reference;
  effectiveDateTime?: string;
  issued?: string;
  performer?: Reference[];
  resultsInterpreter?: Reference[];
  result?: Reference[];
  imagingStudy?: Reference[];
  conclusion?: string;
  conclusionCode?: CodeableConcept[];
  presentedForm?: Attachment[];
}

export interface ImagingStudy extends ResourceBase {
  resourceType: 'ImagingStudy';
  identifier?: Identifier[];
  status: 'registered' | 'available' | 'cancelled' | 'entered-in-error' | 'unknown';
  modality?: Coding[];
  subject: Reference;
  started?: string;
  numberOfSeries?: number;
  numberOfInstances?: number;
  description?: string;
  procedureCode?: CodeableConcept[];
  note?: Annotation[];
  series?: { uid: string; modality: Coding; bodySite?: Coding; numberOfInstances?: number; description?: string }[];
}

export interface RiskAssessmentPrediction {
  outcome?: CodeableConcept;
  probabilityDecimal?: number;
  probabilityRange?: Range;
  qualitativeRisk?: CodeableConcept;
  rationale?: string;
  whenPeriod?: Period;
}

export interface RiskAssessment extends ResourceBase {
  resourceType: 'RiskAssessment';
  identifier?: Identifier[];
  status: 'registered' | 'preliminary' | 'final' | 'amended' | 'corrected' | 'cancelled' | 'entered-in-error' | 'unknown';
  method?: CodeableConcept;
  code?: CodeableConcept;
  subject: Reference;
  encounter?: Reference;
  occurrenceDateTime?: string;
  performer?: Reference;
  basis?: Reference[];
  prediction?: RiskAssessmentPrediction[];
  mitigation?: string;
  note?: Annotation[];
}

export interface Flag extends ResourceBase {
  resourceType: 'Flag';
  identifier?: Identifier[];
  status: 'active' | 'inactive' | 'entered-in-error';
  category?: CodeableConcept[];
  code: CodeableConcept;
  subject: Reference;
  period?: Period;
  author?: Reference;
}

export interface Task extends ResourceBase {
  resourceType: 'Task';
  identifier?: Identifier[];
  basedOn?: Reference[];
  status: 'draft' | 'requested' | 'received' | 'accepted' | 'rejected' | 'ready' | 'cancelled' | 'in-progress' | 'on-hold' | 'failed' | 'completed' | 'entered-in-error';
  intent: 'unknown' | 'proposal' | 'plan' | 'order' | 'original-order' | 'reflex-order' | 'filler-order' | 'instance-order' | 'option';
  priority?: 'routine' | 'urgent' | 'asap' | 'stat';
  code?: CodeableConcept;
  description?: string;
  focus?: Reference;
  for?: Reference;
  authoredOn?: string;
  lastModified?: string;
  requester?: Reference;
  owner?: Reference;
  executionPeriod?: Period;
  note?: Annotation[];
  businessStatus?: CodeableConcept;
  output?: { type: CodeableConcept; valueString?: string; valueReference?: Reference }[];
}

export interface Communication extends ResourceBase {
  resourceType: 'Communication';
  identifier?: Identifier[];
  basedOn?: Reference[];
  partOf?: Reference[];
  status: 'preparation' | 'in-progress' | 'not-done' | 'on-hold' | 'stopped' | 'completed' | 'entered-in-error' | 'unknown';
  category?: CodeableConcept[];
  medium?: CodeableConcept[];
  subject?: Reference;
  sent?: string;
  received?: string;
  recipient?: Reference[];
  sender?: Reference;
  payload?: { contentString?: string }[];
  note?: Annotation[];
  statusReason?: CodeableConcept;
}

export interface Appointment extends ResourceBase {
  resourceType: 'Appointment';
  identifier?: Identifier[];
  status: 'proposed' | 'pending' | 'booked' | 'arrived' | 'fulfilled' | 'cancelled' | 'noshow' | 'entered-in-error' | 'checked-in' | 'waitlist';
  cancelationReason?: CodeableConcept;
  serviceType?: CodeableConcept[];
  appointmentType?: CodeableConcept;
  reasonCode?: CodeableConcept[];
  description?: string;
  start?: string;
  end?: string;
  minutesDuration?: number;
  created?: string;
  comment?: string;
  participant: { actor?: Reference; status: 'accepted' | 'declined' | 'tentative' | 'needs-action'; required?: 'required' | 'optional' | 'information-only' }[];
}

export interface ConsentProvision {
  type?: 'deny' | 'permit';
  period?: Period;
  actor?: { role: CodeableConcept; reference: Reference }[];
  action?: CodeableConcept[];
  purpose?: Coding[];
  class?: Coding[];
  provision?: ConsentProvision[];
}

export interface Consent extends ResourceBase {
  resourceType: 'Consent';
  identifier?: Identifier[];
  status: 'draft' | 'proposed' | 'active' | 'rejected' | 'inactive' | 'entered-in-error';
  scope: CodeableConcept;
  category: CodeableConcept[];
  patient?: Reference;
  dateTime?: string;
  performer?: Reference[];
  organization?: Reference[];
  sourceAttachment?: Attachment;
  policy?: { authority?: string; uri?: string }[];
  provision?: ConsentProvision;
}

export interface Provenance extends ResourceBase {
  resourceType: 'Provenance';
  target: Reference[];
  occurredDateTime?: string;
  recorded: string;
  reason?: CodeableConcept[];
  activity?: CodeableConcept;
  agent: { type?: CodeableConcept; role?: CodeableConcept[]; who: Reference; onBehalfOf?: Reference }[];
  entity?: { role: 'derivation' | 'revision' | 'quotation' | 'source' | 'removal'; what: Reference }[];
  signature?: { type: Coding[]; when: string; who: Reference; data?: string; sigFormat?: string }[];
}

export interface AuditEvent extends ResourceBase {
  resourceType: 'AuditEvent';
  type: Coding;
  subtype?: Coding[];
  action?: 'C' | 'R' | 'U' | 'D' | 'E';
  recorded: string;
  outcome?: '0' | '4' | '8' | '12';
  outcomeDesc?: string;
  purposeOfEvent?: CodeableConcept[];
  agent: { type?: CodeableConcept; who?: Reference; name?: string; requestor: boolean; role?: CodeableConcept[] }[];
  source: { site?: string; observer: Reference; type?: Coding[] };
  entity?: { what?: Reference; type?: Coding; name?: string; description?: string; detail?: { type: string; valueString?: string }[] }[];
}

export interface DocumentReference extends ResourceBase {
  resourceType: 'DocumentReference';
  identifier?: Identifier[];
  status: 'current' | 'superseded' | 'entered-in-error';
  docStatus?: 'preliminary' | 'final' | 'amended' | 'entered-in-error';
  type?: CodeableConcept;
  category?: CodeableConcept[];
  subject?: Reference;
  date?: string;
  author?: Reference[];
  authenticator?: Reference;
  description?: string;
  content: { attachment: Attachment; format?: Coding }[];
  context?: { encounter?: Reference[]; period?: Period };
}

export interface Device extends ResourceBase {
  resourceType: 'Device';
  identifier?: Identifier[];
  status?: 'active' | 'inactive' | 'entered-in-error' | 'unknown';
  deviceName?: { name: string; type: 'udi-label-name' | 'user-friendly-name' | 'patient-reported-name' | 'manufacturer-name' | 'model-name' | 'other' }[];
  version?: { value: string }[];
  manufacturer?: string;
  type?: CodeableConcept;
  note?: Annotation[];
}

export interface BundleEntry<R extends ResourceBase = FhirResource> {
  fullUrl?: string;
  resource?: R;
  search?: { mode?: 'match' | 'include' | 'outcome'; score?: number };
  request?: { method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'; url: string };
  response?: { status: string; location?: string; etag?: string; lastModified?: string };
}

export interface Bundle<R extends ResourceBase = FhirResource> extends ResourceBase {
  resourceType: 'Bundle';
  identifier?: Identifier;
  type: 'document' | 'message' | 'transaction' | 'transaction-response' | 'batch' | 'batch-response' | 'history' | 'searchset' | 'collection';
  timestamp?: string;
  total?: number;
  link?: { relation: string; url: string }[];
  entry?: BundleEntry<R>[];
}

export interface OperationOutcomeIssue {
  severity: 'fatal' | 'error' | 'warning' | 'information';
  code: string;
  diagnostics?: string;
  expression?: string[];
}

export interface OperationOutcome extends ResourceBase {
  resourceType: 'OperationOutcome';
  issue: OperationOutcomeIssue[];
}

export type FhirResource =
  | Patient
  | Practitioner
  | Organization
  | Encounter
  | Observation
  | Condition
  | MedicationRequest
  | AllergyIntolerance
  | DiagnosticReport
  | ImagingStudy
  | RiskAssessment
  | Flag
  | Task
  | Communication
  | Appointment
  | Consent
  | Provenance
  | AuditEvent
  | DocumentReference
  | Device;

export type ResourceType = FhirResource['resourceType'];

export type ResourceOf<T extends ResourceType> = Extract<FhirResource, { resourceType: T }>;

export const RESOURCE_TYPES: ResourceType[] = [
  'Patient',
  'Practitioner',
  'Organization',
  'Encounter',
  'Observation',
  'Condition',
  'MedicationRequest',
  'AllergyIntolerance',
  'DiagnosticReport',
  'ImagingStudy',
  'RiskAssessment',
  'Flag',
  'Task',
  'Communication',
  'Appointment',
  'Consent',
  'Provenance',
  'AuditEvent',
  'DocumentReference',
  'Device',
];

/** Resource types that carry clinical content about a patient (consent-gated). */
export const CLINICAL_TYPES: ResourceType[] = [
  'Encounter',
  'Observation',
  'Condition',
  'MedicationRequest',
  'AllergyIntolerance',
  'DiagnosticReport',
  'ImagingStudy',
  'RiskAssessment',
  'Flag',
  'Task',
  'Communication',
  'Appointment',
  'DocumentReference',
];
