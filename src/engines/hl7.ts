/**
 * HL7 v2.x message parser (ER7 pipe-delimited encoding).
 * Handles the MSH-1/MSH-2 encoding characters, field repetitions (~), components (^),
 * sub-components (&) and escape sequences (\F\ \S\ \T\ \R\ \E\ \.br\).
 */

export interface Hl7Segment {
  name: string;
  /** fields[n] is SEG-n (1-based like the HL7 spec); fields[0] is the segment name. */
  fields: string[];
}

export interface Hl7Message {
  segments: Hl7Segment[];
  encoding: { field: string; component: string; repetition: string; escape: string; subcomponent: string };
  messageType: string; // e.g. "ADT^A01"
  type: string; // "ADT"
  trigger: string; // "A01"
  controlId: string;
  version: string;
  sendingApplication: string;
  sendingFacility: string;
  timestamp?: string;
}

export class Hl7ParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'Hl7ParseError';
  }
}

export function parseHl7(raw: string): Hl7Message {
  const text = raw.replace(/^﻿/, '').trim();
  if (!text.startsWith('MSH')) throw new Hl7ParseError('Message must start with an MSH segment');
  const fieldSep = text.charAt(3);
  const encChars = text.slice(4, 8);
  if (!fieldSep || encChars.length < 4) throw new Hl7ParseError('MSH encoding characters are missing');
  const encoding = {
    field: fieldSep,
    component: encChars.charAt(0),
    repetition: encChars.charAt(1),
    escape: encChars.charAt(2),
    subcomponent: encChars.charAt(3),
  };
  const lines = text.split(/\r\n|\r|\n/).map((l) => l.trim()).filter(Boolean);
  const segments: Hl7Segment[] = lines.map((line) => {
    const parts = line.split(fieldSep);
    const name = parts[0] ?? '';
    if (!/^[A-Z][A-Z0-9]{2}$/.test(name)) throw new Hl7ParseError(`Invalid segment name "${name}"`);
    if (name === 'MSH') {
      // MSH-1 is the field separator itself, MSH-2 the encoding characters.
      return { name, fields: ['MSH', fieldSep, ...parts.slice(1)] };
    }
    return { name, fields: parts };
  });
  const msh = segments[0]!;
  const messageType = msh.fields[9] ?? '';
  const [type = '', trigger = ''] = messageType.split(encoding.component);
  if (!type) throw new Hl7ParseError('MSH-9 message type is missing');
  return {
    segments,
    encoding,
    messageType: `${type}^${trigger}`,
    type,
    trigger,
    controlId: msh.fields[10] ?? '',
    version: msh.fields[12] ?? '',
    sendingApplication: (msh.fields[3] ?? '').split(encoding.component)[0] ?? '',
    sendingFacility: (msh.fields[4] ?? '').split(encoding.component)[0] ?? '',
    timestamp: hl7DateTime(msh.fields[7]),
  };
}

export function unescapeHl7(value: string, enc: Hl7Message['encoding']): string {
  const e = enc.escape;
  if (!value.includes(e)) return value;
  const re = new RegExp(`\\${e}(F|S|T|R|E|\\.br)\\${e}`, 'g');
  return value.replace(re, (_, code: string) => {
    switch (code) {
      case 'F':
        return enc.field;
      case 'S':
        return enc.component;
      case 'T':
        return enc.subcomponent;
      case 'R':
        return enc.repetition;
      case 'E':
        return enc.escape;
      default:
        return '\n';
    }
  });
}

export function segmentsNamed(msg: Hl7Message, name: string): Hl7Segment[] {
  return msg.segments.filter((s) => s.name === name);
}

export function segment(msg: Hl7Message, name: string): Hl7Segment | undefined {
  return msg.segments.find((s) => s.name === name);
}

/** Read SEG-field[.component[.subcomponent]] from repetition `rep` (all 1-based). */
export function hl7Get(msg: Hl7Message, seg: Hl7Segment | undefined, field: number, component = 0, rep = 1, sub = 0): string {
  if (!seg) return '';
  const raw = seg.fields[field] ?? '';
  const repetition = seg.name === 'MSH' && field <= 2 ? raw : (raw.split(msg.encoding.repetition)[rep - 1] ?? '');
  if (!component) return unescapeHl7(repetition, msg.encoding);
  const comp = repetition.split(msg.encoding.component)[component - 1] ?? '';
  if (!sub) return unescapeHl7(comp, msg.encoding);
  return unescapeHl7(comp.split(msg.encoding.subcomponent)[sub - 1] ?? '', msg.encoding);
}

export function hl7Repetitions(msg: Hl7Message, seg: Hl7Segment | undefined, field: number): string[] {
  if (!seg) return [];
  return (seg.fields[field] ?? '').split(msg.encoding.repetition).filter(Boolean);
}

/** HL7 TS/DTM (YYYY[MM[DD[HH[MM[SS]]]]][±ZZZZ]) → ISO 8601. */
export function hl7DateTime(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const m = /^(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?(?:\.\d+)?([+-]\d{4})?$/.exec(value.trim());
  if (!m) return undefined;
  const [, y, mo, d, h, mi, s, tz] = m;
  if (!mo) return y;
  if (!d) return `${y}-${mo}`;
  if (!h) return `${y}-${mo}-${d}`;
  const zone = tz ? `${tz.slice(0, 3)}:${tz.slice(3)}` : '+05:30';
  return `${y}-${mo}-${d}T${h}:${mi ?? '00'}:${s ?? '00'}${zone}`;
}

export function hl7Date(value: string | undefined): string | undefined {
  const dt = hl7DateTime(value);
  return dt?.slice(0, 10);
}

/* ───────────── Sample messages (built-in demos) ───────────── */

/** Build a segment from a sparse field map so sample field positions are exact. */
export function buildSegment(name: string, fields: Record<number, string>): string {
  const max = Math.max(0, ...Object.keys(fields).map(Number));
  const parts = [name];
  for (let i = 1; i <= max; i++) parts.push(fields[i] ?? '');
  return parts.join('|');
}

const MSH = (app: string, fac: string, ts: string, type: string, id: string) =>
  `MSH|^~\\&|${app}|${fac}|CURA_NEXUS|CURA|${ts}||${type}|${id}|P|2.5.1`;

export const SAMPLE_HL7: { id: string; label: string; message: string }[] = [
  {
    id: 'adt-a04',
    label: 'ADT^A04 — register outpatient from an external HIS',
    message: [
      MSH('KARE_HIS', 'KARE_CHENNAI', '20241014093000+0530', 'ADT^A04^ADT_A01', 'MSG00041'),
      'EVN|A04|20241014093000+0530',
      buildSegment('PID', {
        1: '1',
        3: 'HIS-77120^^^KARE_HIS^MR',
        5: 'Venkataraman^Lakshmi^S',
        7: '19670322',
        8: 'F',
        11: '14 Gandhi Road^Mylapore^Chennai^TN^600004^IND',
        13: '+91 98410 22671',
        16: 'M',
      }),
      buildSegment('PV1', { 1: '1', 2: 'O', 3: 'OPD^^^CURA', 7: 'D1001^Iyer^Ananya^^^Dr', 10: 'MED', 19: 'V-55102', 44: '20241014093000+0530' }),
    ].join('\r'),
  },
  {
    id: 'adt-a01',
    label: 'ADT^A01 — admit inpatient (new patient)',
    message: [
      MSH('KARE_HIS', 'KARE_PUNE', '20241015221500+0530', 'ADT^A01^ADT_A01', 'MSG00042'),
      'EVN|A01|20241015221500+0530',
      buildSegment('PID', {
        1: '1',
        3: 'HIS-77121^^^KARE_HIS^MR',
        5: 'Khan^Imran',
        7: '19580704',
        8: 'M',
        11: 'Flat 7, Shivaji Nagar^^Pune^MH^411005^IND',
        13: '+91 90110 44523',
      }),
      buildSegment('PV1', { 1: '1', 2: 'I', 3: 'MED-W^204^B^CURA', 7: 'D1002^Menon^Rahul^^^Dr', 10: 'MED', 19: 'V-55103', 44: '20241015221500+0530' }),
      'DG1|1||J18.9^Pneumonia, unspecified organism^I10||20241015|A',
    ].join('\r'),
  },
  {
    id: 'adt-a08',
    label: 'ADT^A08 — update patient information (phone + address)',
    message: [
      MSH('KARE_HIS', 'KARE_CHENNAI', '20241016101000+0530', 'ADT^A08^ADT_A01', 'MSG00043'),
      'EVN|A08|20241016101000+0530',
      buildSegment('PID', {
        1: '1',
        3: 'HIS-77120^^^KARE_HIS^MR',
        5: 'Venkataraman^Lakshmi^S',
        7: '19670322',
        8: 'F',
        11: '22 Luz Church Road^Mylapore^Chennai^TN^600004^IND',
        13: '+91 98410 22999',
      }),
      buildSegment('PV1', { 1: '1', 2: 'O', 3: 'OPD^^^CURA' }),
    ].join('\r'),
  },
  {
    id: 'oru-r01',
    label: 'ORU^R01 — lab results (HbA1c, creatinine, lipids)',
    message: [
      MSH('METRO_LIS', 'METROLAB', '20241016153000+0530', 'ORU^R01^ORU_R01', 'LAB88231'),
      buildSegment('PID', { 1: '1', 3: 'HIS-77120^^^KARE_HIS^MR', 5: 'Venkataraman^Lakshmi^S', 7: '19670322', 8: 'F' }),
      buildSegment('OBR', { 1: '1', 2: 'ORD-5521', 3: 'LAB-88231', 4: '24331-1^Lipid panel^LN', 7: '20241016083000+0530', 16: 'D1001^Iyer^Ananya', 25: 'F' }),
      'OBX|1|NM|4548-4^Hemoglobin A1c^LN||8.1|%|4.0-5.6|H|||F|||20241016083000+0530',
      'OBX|2|NM|2160-0^Creatinine^LN||1.3|mg/dL|0.6-1.1|H|||F|||20241016083000+0530',
      'OBX|3|NM|2093-3^Cholesterol total^LN||214|mg/dL|<200|H|||F|||20241016083000+0530',
      'OBX|4|NM|2085-9^HDL cholesterol^LN||41|mg/dL|>40|N|||F|||20241016083000+0530',
      'OBX|5|ST|8251-1^Service comment^LN||Sample slightly haemolysed\\.br\\Repeat if clinically indicated||||||F',
    ].join('\r'),
  },
];
