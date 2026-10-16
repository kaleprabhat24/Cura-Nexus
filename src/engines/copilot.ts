/**
 * Clinical Co-Pilot — a supervisor-pattern pipeline that runs fully offline:
 *
 *   guardrail → route → retrieve → analyse → answer
 *
 * - guardrail: PII redaction, emergency detection, off-topic refusal
 * - route:     intent classification (knowledge / patient summary / patient data /
 *              drug interaction / calculator)
 * - retrieve:  BM25 over the bundled knowledge base + the selected patient's record chunks
 * - analyse:   deterministic tools (pharmacy engine, calculators) for the routed intent
 * - answer:    templated, cited answer (an optional LLM may rephrase it, never re-score it)
 */
import { KB, type KbArticle } from '@/kb/articles';
import { DRUGS } from '@/fhir/codes';
import { Bm25Index, type Bm25Doc } from './bm25';
import { redactPii, type Redaction } from './pii';
import { checkInteractions } from './pharmacy';
import { bmi, bmiCategory, ckdStage, egfrCkdEpi2021 } from './calculators';

export type CopilotMode = 'clinician' | 'patient';
export type Intent = 'knowledge' | 'patient-summary' | 'patient-data' | 'interaction' | 'calculator' | 'off-topic' | 'greeting';

export interface PatientContext {
  id: string;
  label: string; // e.g. "62 y female" — never the name
  age?: number;
  sex?: 'male' | 'female';
  conditions: string[];
  medications: { name: string; key?: string; dose?: string }[];
  allergies: string[];
  labs: { name: string; value: number; unit: string; date: string; flag?: 'high' | 'low' }[];
  risks: { name: string; probability?: number; tier: string; source: string }[];
  imaging: { summary: string; priority: string; date: string }[];
  followUp: { tier: string; action?: string; date: string }[];
}

export interface Citation {
  n: number;
  id: string;
  title: string;
  source: string;
  kind: 'kb' | 'patient' | 'tool';
}

export interface TraceStep {
  node: 'guardrail' | 'router' | 'retrieve' | 'analyse' | 'answer';
  detail: string;
}

export interface CopilotResult {
  intent: Intent;
  answer: string;
  citations: Citation[];
  redactions: Redaction[];
  urgent: boolean;
  trace: TraceStep[];
  /** Facts given to an LLM if one is configured (already PII-free). */
  context: string[];
  redactedQuestion: string;
}

interface KbDoc extends Bm25Doc {
  article?: KbArticle;
  kind: 'kb' | 'patient';
}

let kbIndex: Bm25Index<KbDoc> | null = null;

function kbDocs(): KbDoc[] {
  return KB.map((a) => ({ id: a.id, title: a.title, text: `${a.text} ${a.category}`, source: a.source, article: a, kind: 'kb' as const }));
}

function getKbIndex(): Bm25Index<KbDoc> {
  kbIndex ??= new Bm25Index(kbDocs());
  return kbIndex;
}

const EMERGENCY = /\b(chest pain|crushing pain|can'?t breathe|cannot breathe|not breathing|unconscious|unresponsive|suicid|kill myself|overdose|severe bleeding|vomiting blood|face droop|slurred speech|seizure|fits)\b/i;
const HEALTH =
  /\b(health|medic|drug|tablet|pill|dose|symptom|pain|fever|cough|breath|blood|sugar|glucose|diabet|bp|pressure|heart|kidney|renal|liver|lung|asthma|copd|cancer|doctor|nurse|hospital|patient|lab|test|hba1c|a1c|egfr|creatinine|cholesterol|statin|insulin|metformin|vaccine|diet|exercise|weight|bmi|allerg|infection|tb|tuberculosis|thyroid|anaemia|anemia|sepsis|news2|fhir|abha|abdm|consent|record|x-?ray|scan|risk|smok|alcohol|sleep|stress|depress|anxiety|pregnan|warfarin|clopidogrel|aspirin|interaction|side effect|summary|history|trend|latest|result|report|follow.?up|outreach|appointment)/i;
const OFF_TOPIC = /\b(cricket|football|ipl|movie|film|song|lyrics|stock|share price|bitcoin|crypto|weather|politic|election|recipe|javascript|python|code|program|joke|homework|celebrity|game|horoscope)\b/i;
const GREETING = /^\s*(hi|hello|hey|namaste|good (morning|afternoon|evening)|thanks|thank you)\b[\s!.]*$/i;

const LAB_WORDS: Record<string, string[]> = {
  HbA1c: ['hba1c', 'a1c', 'glycated', 'sugar control'],
  'Fasting glucose': ['glucose', 'sugar', 'fpg'],
  Creatinine: ['creatinine'],
  eGFR: ['egfr', 'kidney function', 'gfr'],
  'Systolic BP': ['bp', 'blood pressure', 'systolic', 'hypertension'],
  'Diastolic BP': ['diastolic'],
  'Total cholesterol': ['cholesterol', 'lipid'],
  HDL: ['hdl'],
  LDL: ['ldl'],
  Weight: ['weight'],
  BMI: ['bmi'],
  'Heart rate': ['heart rate', 'pulse'],
  'SpO₂': ['spo2', 'oxygen', 'saturation'],
};

function detectDrugs(text: string): string[] {
  const t = text.toLowerCase();
  return DRUGS.filter((d) => t.includes(d.key.replace(/_/g, ' ')) || t.includes(d.name.toLowerCase().split(' ')[0]!)).map((d) => d.key);
}

export function classify(q: string, hasPatient: boolean): Intent {
  if (GREETING.test(q)) return 'greeting';
  if (OFF_TOPIC.test(q) && !HEALTH.test(q)) return 'off-topic';
  const drugs = detectDrugs(q);
  if (drugs.length >= 2 || (drugs.length >= 1 && /interact|together|combine|with|safe to take|and/i.test(q) && hasPatient)) return 'interaction';
  if (/\b(egfr|bmi)\b/i.test(q) && /\d/.test(q) && /(calculate|compute|what is|estimate|for)/i.test(q)) return 'calculator';
  if (hasPatient && /\b(summar|overview|history|background|tell me about (this|the) patient|brief|handover)\b/i.test(q)) return 'patient-summary';
  if (hasPatient && (/\b(latest|last|recent|trend|current|his|her|their|my|patient'?s?)\b/i.test(q) || /\b(risk|x-?ray|imaging|follow.?up|medication|allerg)/i.test(q))) {
    return 'patient-data';
  }
  return 'knowledge';
}

function patientDocs(p: PatientContext): KbDoc[] {
  const docs: KbDoc[] = [
    { id: `patient:${p.id}:conditions`, title: 'Patient problems', text: `Active conditions: ${p.conditions.join(', ') || 'none recorded'}`, source: 'Patient record — Condition', kind: 'patient' },
    {
      id: `patient:${p.id}:meds`,
      title: 'Patient medications',
      text: `Current medications: ${p.medications.map((m) => `${m.name}${m.dose ? ` ${m.dose}` : ''}`).join('; ') || 'none recorded'}. Allergies: ${p.allergies.join(', ') || 'no known allergies'}`,
      source: 'Patient record — MedicationRequest / AllergyIntolerance',
      kind: 'patient',
    },
    {
      id: `patient:${p.id}:labs`,
      title: 'Patient results',
      text: p.labs.map((l) => `${l.name} ${l.value} ${l.unit} on ${l.date}${l.flag ? ` (${l.flag})` : ''}`).join('; '),
      source: 'Patient record — Observation',
      kind: 'patient',
    },
    {
      id: `patient:${p.id}:risk`,
      title: 'Patient risk assessments',
      text: p.risks.map((r) => `${r.name}: ${r.tier}${r.probability !== undefined ? ` (${Math.round(r.probability * 100)}%)` : ''} from ${r.source}`).join('; ') || 'No risk assessments',
      source: 'Patient record — RiskAssessment',
      kind: 'patient',
    },
  ];
  if (p.imaging.length)
    docs.push({ id: `patient:${p.id}:imaging`, title: 'Patient chest X-ray triage', text: p.imaging.map((i) => `${i.date}: ${i.summary} (${i.priority})`).join('; '), source: 'Patient record — ImagingStudy / DiagnosticReport (Module 1)', kind: 'patient' });
  if (p.followUp.length)
    docs.push({ id: `patient:${p.id}:followup`, title: 'Patient chronic follow-up', text: p.followUp.map((f) => `${f.date}: ${f.tier} priority${f.action ? ` — ${f.action}` : ''}`).join('; '), source: 'Patient record — RiskAssessment / Task (Module 2)', kind: 'patient' });
  return docs;
}

const DISCLAIMER = {
  clinician: 'Decision support only — verify against the source guideline and the full record before acting.',
  patient: 'This is general information, not a diagnosis. Please talk to your doctor or nurse about your own care, and call 108 in an emergency.',
};

function firstSentences(text: string, n: number): string {
  const parts = text.match(/[^.!?]+[.!?]+/g) ?? [text];
  return parts.slice(0, n).join(' ').trim();
}

export function runCopilot(question: string, opts: { mode: CopilotMode; patient?: PatientContext }): CopilotResult {
  const trace: TraceStep[] = [];
  const { text: redacted, redactions } = redactPii(question);
  const urgent = EMERGENCY.test(question);
  trace.push({
    node: 'guardrail',
    detail: `${redactions.length ? `Redacted ${redactions.length} identifier(s) (${[...new Set(redactions.map((r) => r.type))].join(', ')})` : 'No PII found'}${urgent ? '; emergency phrase detected' : ''}`,
  });

  let intent = classify(redacted, !!opts.patient);
  // Unknown vocabulary with no knowledge-base support is treated as out of scope.
  if (intent === 'knowledge' && !HEALTH.test(redacted) && !detectDrugs(redacted).length && (getKbIndex().search(redacted, 1)[0]?.score ?? 0) < 2.5) {
    intent = 'off-topic';
  }
  trace.push({ node: 'router', detail: `intent = ${intent}${opts.patient ? ` · patient context: ${opts.patient.label}` : ''}` });

  const citations: Citation[] = [];
  const context: string[] = [];
  const cite = (id: string, title: string, source: string, kind: Citation['kind']) => {
    const existing = citations.find((c) => c.id === id);
    if (existing) return existing.n;
    const n = citations.length + 1;
    citations.push({ n, id, title, source, kind });
    return n;
  };
  const urgentPrefix = urgent
    ? opts.mode === 'patient'
      ? 'If this is happening now, call 108 or go to the nearest emergency department immediately. '
      : 'Emergency features described — assess immediately (ABCDE) and escalate per protocol. '
    : '';

  if (intent === 'off-topic') {
    trace.push({ node: 'answer', detail: 'Refused: outside clinical scope' });
    return {
      intent,
      answer: 'I can only help with health, clinical and medical-record questions. Try asking about a condition, a medicine, a test result or the selected patient.',
      citations,
      redactions,
      urgent,
      trace,
      context,
      redactedQuestion: redacted,
    };
  }
  if (intent === 'greeting') {
    trace.push({ node: 'answer', detail: 'Greeting' });
    return {
      intent,
      answer:
        opts.mode === 'patient'
          ? 'Hello! I can explain your results, medicines and conditions in simple words. What would you like to know?'
          : 'Hello. Ask me about guidelines, drug interactions, calculators, or select a patient to query their record.',
      citations,
      redactions,
      urgent,
      trace,
      context,
      redactedQuestion: redacted,
    };
  }

  // Retrieve
  const kbHits = getKbIndex().search(redacted, 3);
  const pDocs = opts.patient ? patientDocs(opts.patient) : [];
  const pHits = pDocs.length ? new Bm25Index(pDocs).search(redacted, 2) : [];
  trace.push({
    node: 'retrieve',
    detail: `BM25: ${kbHits.length} knowledge article(s)${kbHits[0] ? ` (top: "${kbHits[0].doc.title}", score ${kbHits[0].score.toFixed(2)})` : ''}${opts.patient ? `, ${pHits.length} record chunk(s)` : ''}`,
  });

  let body = '';
  const p = opts.patient;

  if (intent === 'interaction') {
    const drugs = detectDrugs(redacted);
    const pool = [...new Set([...drugs, ...(p?.medications.map((m) => m.key).filter((k): k is string => !!k) ?? [])])];
    const hits = checkInteractions(drugs.length >= 2 ? drugs : pool);
    const relevant = drugs.length >= 2 ? hits : hits.filter((h) => drugs.includes(h.drugA.key) || drugs.includes(h.drugB.key));
    const n = cite('tool:pharmacy', 'Pharmacy safety engine (DDI table)', 'Cura Nexus embedded interaction rules', 'tool');
    trace.push({ node: 'analyse', detail: `Pharmacy engine checked ${pool.length} drug(s): ${relevant.length} interaction(s)` });
    if (!relevant.length) {
      body = `No interaction between ${drugs.map((d) => DRUGS.find((x) => x.key === d)?.name).join(' and ')}${drugs.length < 2 && p ? ' and the patient\'s current medicines' : ''} is listed in the embedded table [${n}]. Absence from this teaching subset does not prove safety.`;
    } else {
      body = relevant
        .map((h) =>
          opts.mode === 'patient'
            ? `${h.drugA.name} with ${h.drugB.name}: ${h.rule.effect} Please check with your doctor or pharmacist before taking them together [${n}].`
            : `${h.drugA.name} + ${h.drugB.name} — ${h.rule.severity.toUpperCase()}: ${h.rule.effect} Management: ${h.rule.management} [${n}]`,
        )
        .join('\n\n');
    }
    context.push(body);
  } else if (intent === 'calculator') {
    const q = redacted.toLowerCase();
    if (q.includes('egfr')) {
      const cr = Number(/creatinine[^\d]*(\d+(?:\.\d+)?)/.exec(q)?.[1] ?? /(\d+\.\d+)/.exec(q)?.[1]);
      const age = Number(/(\d{2})\s*(?:y|yr|year|-year)/.exec(q)?.[1] ?? p?.age);
      const sex: 'male' | 'female' = /female|woman|\bf\b/.test(q) ? 'female' : /male|man|\bm\b/.test(q) ? 'male' : (p?.sex ?? 'male');
      if (cr && age >= 18) {
        const e = egfrCkdEpi2021(cr, age, sex);
        const st = ckdStage(e);
        const n = cite('tool:egfr', 'CKD-EPI 2021 calculator', 'Inker LA et al. N Engl J Med 2021', 'tool');
        body = `eGFR ≈ ${e.toFixed(0)} mL/min/1.73m² for creatinine ${cr} mg/dL, age ${age}, ${sex} — stage ${st.stage} (${st.label}) [${n}].`;
        trace.push({ node: 'analyse', detail: `CKD-EPI 2021: ${e.toFixed(1)}` });
      } else body = 'To estimate eGFR I need a creatinine value (mg/dL), age (≥ 18) and sex, e.g. "eGFR for creatinine 1.4, 62 year female".';
    } else {
      const w = Number(/(\d+(?:\.\d+)?)\s*kg/.exec(q)?.[1]);
      const h = Number(/(\d+(?:\.\d+)?)\s*cm/.exec(q)?.[1]);
      if (w && h) {
        const v = bmi(w, h);
        const n = cite('tool:bmi', 'BMI calculator (WHO Asian cut-offs)', 'WHO Expert Consultation, Lancet 2004', 'tool');
        body = `BMI = ${v.toFixed(1)} kg/m² — ${bmiCategory(v).label} [${n}].`;
        trace.push({ node: 'analyse', detail: `BMI ${v.toFixed(1)}` });
      } else body = 'To calculate BMI I need weight in kg and height in cm, e.g. "BMI for 72 kg and 165 cm".';
    }
    context.push(body);
  } else if ((intent === 'patient-summary' || intent === 'patient-data') && p) {
    trace.push({ node: 'analyse', detail: `Read patient record (${p.labs.length} results, ${p.medications.length} medicines, ${p.risks.length} risk assessments)` });
    const lines: string[] = [];
    if (intent === 'patient-summary') {
      const nc = cite(pDocs[0]!.id, 'Problem list', pDocs[0]!.source!, 'patient');
      const nm = cite(pDocs[1]!.id, 'Medications & allergies', pDocs[1]!.source!, 'patient');
      lines.push(`${p.label}. Active problems: ${p.conditions.join(', ') || 'none recorded'} [${nc}].`);
      lines.push(`Medications: ${p.medications.map((m) => m.name).join(', ') || 'none'}; allergies: ${p.allergies.join(', ') || 'none known'} [${nm}].`);
      const recent = p.labs.slice(0, 5);
      if (recent.length) {
        const nl = cite(pDocs[2]!.id, 'Recent results', pDocs[2]!.source!, 'patient');
        lines.push(`Recent results: ${recent.map((l) => `${l.name} ${l.value} ${l.unit}${l.flag ? ` (${l.flag})` : ''}`).join(', ')} [${nl}].`);
      }
      if (p.risks.length) {
        const nr = cite(pDocs[3]!.id, 'Risk assessments', pDocs[3]!.source!, 'patient');
        lines.push(`Risk: ${p.risks.map((r) => `${r.name} ${r.tier}`).join(', ')} [${nr}].`);
      }
      if (p.imaging.length) {
        const doc = pDocs.find((d) => d.id.endsWith(':imaging'))!;
        const ni = cite(doc.id, 'CXR triage (Module 1)', doc.source!, 'patient');
        lines.push(`Latest CXR triage: ${p.imaging[0]!.summary} (${p.imaging[0]!.priority}) [${ni}].`);
      }
      if (p.followUp.length) {
        const doc = pDocs.find((d) => d.id.endsWith(':followup'))!;
        const nf = cite(doc.id, 'Chronic follow-up (Module 2)', doc.source!, 'patient');
        lines.push(`Chronic follow-up priority: ${p.followUp[0]!.tier}${p.followUp[0]!.action ? ` — ${p.followUp[0]!.action}` : ''} [${nf}].`);
      }
    } else {
      const q = redacted.toLowerCase();
      const wanted = Object.entries(LAB_WORDS)
        .filter(([, words]) => words.some((w) => q.includes(w)))
        .map(([name]) => name);
      if (/risk/.test(q) && p.risks.length) {
        const nr = cite(pDocs[3]!.id, 'Risk assessments', pDocs[3]!.source!, 'patient');
        lines.push(`${p.risks.map((r) => `${r.name}: ${r.tier}${r.probability !== undefined ? ` (${Math.round(r.probability * 100)}%)` : ''}, from ${r.source}`).join('; ')} [${nr}].`);
      }
      if (/x-?ray|imaging|cxr/.test(q)) {
        const doc = pDocs.find((d) => d.id.endsWith(':imaging'));
        if (doc) lines.push(`${p.imaging.map((i) => `${i.date}: ${i.summary} (${i.priority})`).join('; ')} [${cite(doc.id, 'CXR triage (Module 1)', doc.source!, 'patient')}].`);
        else lines.push('No chest X-ray triage results are on file for this patient.');
      }
      if (/medic|drug|tablet/.test(q) || /allerg/.test(q)) {
        lines.push(`Medications: ${p.medications.map((m) => `${m.name}${m.dose ? ` ${m.dose}` : ''}`).join('; ') || 'none'}. Allergies: ${p.allergies.join(', ') || 'none known'} [${cite(pDocs[1]!.id, 'Medications & allergies', pDocs[1]!.source!, 'patient')}].`);
      }
      if (/follow.?up|outreach/.test(q)) {
        const doc = pDocs.find((d) => d.id.endsWith(':followup'));
        if (doc) lines.push(`${p.followUp.map((f) => `${f.date}: ${f.tier}${f.action ? ` — ${f.action}` : ''}`).join('; ')} [${cite(doc.id, 'Chronic follow-up (Module 2)', doc.source!, 'patient')}].`);
      }
      for (const name of wanted) {
        const series = p.labs.filter((l) => l.name === name);
        if (!series.length) {
          lines.push(`No ${name} results on file.`);
          continue;
        }
        const nl = cite(pDocs[2]!.id, 'Results', pDocs[2]!.source!, 'patient');
        const latest = series[0]!;
        const prev = series[1];
        const trend = prev ? (latest.value > prev.value ? 'up' : latest.value < prev.value ? 'down' : 'unchanged') : undefined;
        lines.push(
          opts.mode === 'patient'
            ? `Your latest ${name} was ${latest.value} ${latest.unit} on ${latest.date}${latest.flag ? `, which is ${latest.flag === 'high' ? 'above' : 'below'} the usual range` : ', within the usual range'}${trend ? ` (${trend} from ${prev!.value})` : ''} [${nl}].`
            : `${name}: ${latest.value} ${latest.unit} (${latest.date})${latest.flag ? ` — ${latest.flag}` : ''}${trend ? `; ${trend} from ${prev!.value} ${prev!.unit} (${prev!.date})` : ''} [${nl}].`,
        );
      }
      if (!lines.length) {
        lines.push(`I could not find that in the record. Available: ${p.labs.length} results, ${p.medications.length} medicines, ${p.risks.length} risk assessments.`);
      }
    }
    body = lines.join(' ');
    context.push(body);
    // Add the most relevant guideline as supporting context.
    const top = kbHits[0];
    if (top && top.score > 3 && top.doc.article) {
      const n = cite(top.doc.id, top.doc.title, top.doc.article.source, 'kb');
      const g = opts.mode === 'patient' ? top.doc.article.plain : firstSentences(top.doc.article.text, 2);
      body += `\n\nRelevant guidance: ${g} [${n}]`;
      context.push(top.doc.article.text);
    }
  } else {
    trace.push({ node: 'analyse', detail: 'No tool needed — answering from retrieved knowledge' });
    const good = kbHits.filter((h) => h.score >= 2.5 && h.doc.article);
    if (!good.length) {
      body =
        opts.mode === 'patient'
          ? "I'm not sure about that one. Please ask your doctor or nurse — they can look at your full record."
          : 'No sufficiently relevant article in the bundled knowledge base. Try rephrasing with a condition, drug or test name.';
    } else {
      const parts = good.slice(0, 2).map((h) => {
        const a = h.doc.article!;
        const n = cite(a.id, a.title, a.source, 'kb');
        context.push(a.text);
        return opts.mode === 'patient' ? `${a.plain} [${n}]` : `**${a.title}.** ${firstSentences(a.text, 4)} [${n}]`;
      });
      body = parts.join('\n\n');
      if (p && pHits.length && pHits[0]!.score > 1) {
        const d = pHits[0]!.doc;
        const n = cite(d.id, d.title, d.source!, 'patient');
        body += `\n\nFor this patient: ${d.text} [${n}]`;
        context.push(d.text);
      }
    }
  }

  trace.push({ node: 'answer', detail: `${citations.length} citation(s)` });
  return {
    intent,
    answer: `${urgentPrefix}${body}\n\n_${DISCLAIMER[opts.mode]}_`,
    citations,
    redactions,
    urgent,
    trace,
    context,
    redactedQuestion: redacted,
  };
}
