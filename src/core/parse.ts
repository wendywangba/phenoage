// Find the nine PhenoAge markers in OCR output from a lab report.
// Works on table layouts in any column order: name, result, unit, reference range.

import {
  MARKERS,
  MARKER_IDS,
  RDW_SD_NAMES,
  looksLikeUnit,
  normName,
  toHalfWidth,
  unitId,
  type MarkerId,
} from "./markers.ts";

export interface OcrText {
  text: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface Finding {
  id: MarkerId;
  value: number;
  /** "<0.5" style results: the true value is below (or above) the number. */
  qualifier?: "<" | ">";
  /** Unit id read from the report, if any. */
  unit?: string;
  rawName: string;
  rawValue: string;
  rawUnit?: string;
  /** Which uploaded image it came from. */
  image?: number;
}

export type NoteKind = "rdwSdOnly" | "lymphFromAbsolute";

export interface ParseResult {
  findings: Finding[];
  /** RDW-SD values (fL). PhenoAge needs RDW-CV, so these are only used to explain a gap. */
  rdwSd: number[];
  /** Absolute lymphocyte counts (10^9/L), which can give the percentage together with WBC. */
  lymphAbs: number[];
}

interface Item extends OcrText {
  t: string;
  cx: number;
  cy: number;
  h: number;
}

interface NameMatch {
  id: MarkerId | "rdwSd" | "lymphAbs";
  ambiguous?: boolean;
}

// ------------------------------------------------------------ name matching

const ALL_NAMES = MARKER_IDS.flatMap((id) => MARKERS[id].names.map((n) => ({ id, n })));

export function identify(raw: string): NameMatch | null {
  const n = normName(raw);
  if (n.length < 2) return null;
  const codes: string[] = [];
  const base = n.replace(/\(([^)]*)\)?/g, (_m, c: string) => {
    codes.push(c);
    return "";
  });
  if (RDW_SD_NAMES.includes(base) || codes.includes("RDWSD")) return { id: "rdwSd" };
  if (/^淋巴细胞(绝对值|计数|数|数目|总数)$/.test(base) || codes.includes("LYM#") || /^LY(M|MPH)?#$/.test(base)) {
    return { id: "lymphAbs" };
  }
  for (const id of MARKER_IDS) {
    if (MARKERS[id].names.includes(base)) return { id };
  }
  for (const id of MARKER_IDS) {
    const m = MARKERS[id];
    if (m.codes.includes(base) || (base === "" && codes.some((c) => m.codes.includes(c)))) return { id };
    if (base.length >= 2 && !/[A-Z]/.test(base) && codes.length === 1 && m.codes.includes(codes[0])) {
      // Chinese name we don't list, but a code we know, e.g. "肌酐(酶法)(CREA)".
      return { id };
    }
  }
  for (const id of MARKER_IDS) {
    if (MARKERS[id].ambiguous?.includes(base)) return { id, ambiguous: true };
  }
  // A long name wrapped onto two lines: accept the first line if it is one
  // character short of a single marker's name ("碱性磷酸" + "酶").
  if (base.length >= 4 && !/\d/.test(base)) {
    const hits = new Set(ALL_NAMES.filter((a) => a.n.startsWith(base) && a.n.length - base.length <= 1).map((a) => a.id));
    if (hits.size === 1) return { id: [...hits][0] };
  }
  return null;
}

// ----------------------------------------------------------- value parsing

const RANGE = /\d\s*(-{1,2}|~|～|—|–|至)\s*\d/;
const FLAGS = /(↑|↓|偏高|偏低|升高|降低|阳性|\*)+/g;

export interface ParsedValue {
  value: number;
  qualifier?: "<" | ">";
  unitText?: string;
}

export function parseValue(raw: string): ParsedValue | null {
  let t = toHalfWidth(raw).trim();
  t = t.replace(/(\d)\s*[.,·]\s*(?=\d)/g, "$1."); // "41. 40" → "41.40"
  if (!/\d/.test(t) || looksLikeUnit(t) || RANGE.test(t)) return null;
  t = t.replace(FLAGS, " ").trim();
  const m = /^([<>≤≥]=?|小于|大于|低于)?\s*(\d+(?:\.\d+)?)\s*(.*)$/.exec(t);
  if (!m) return null;
  const rest = m[3].trim();
  let unitText: string | undefined;
  if (rest && !/^[HL]$/i.test(rest)) {
    if (!looksLikeUnit(rest)) return null;
    unitText = rest;
  }
  const q = m[1];
  const qualifier = q ? (/[<≤小低]/.test(q) ? "<" : ">") : undefined;
  return { value: parseFloat(m[2]), qualifier, unitText };
}

// --------------------------------------------------------------- layout

const RESULT_HEADER = /^(检查结果|检验结果|检测结果|本次结果|结果|测定值|测定结果|检测值|结果值|RESULTS?|VALUE|YOURVALUE)$/;
const UNIT_HEADER = /^(单位|UNITS?)$/;

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

function prepare(boxes: OcrText[]): Item[] {
  return boxes
    .filter((b) => b.text && b.text.trim())
    .map((b) => ({
      ...b,
      t: b.text.trim(),
      cx: (b.x0 + b.x1) / 2,
      cy: (b.y0 + b.y1) / 2,
      h: b.y1 - b.y0,
    }))
    .sort((a, b) => a.cy - b.cy || a.x0 - b.x0);
}

/** The header cell closest above `y` matching `re`, if any. */
function headerAbove(items: Item[], re: RegExp, y: number, H: number): Item | undefined {
  let best: Item | undefined;
  for (const it of items) {
    if (it.cy > y - 0.3 * H) continue;
    if (!re.test(normName(it.t))) continue;
    if (!best || it.cy > best.cy) best = it;
  }
  return best;
}

export function parseReport(boxes: OcrText[], image?: number): ParseResult {
  const items = prepare(boxes);
  const H = median(items.map((i) => i.h)) || 20;
  const out: ParseResult = { findings: [], rdwSd: [], lymphAbs: [] };
  const used = new Set<Item>();

  for (const it of items) {
    if (used.has(it)) continue;

    // 1. Is this cell a marker name? Try it alone, then joined with a wrapped second line.
    let match = identify(it.t);
    let span = { y0: it.y0, y1: it.y1, x1: it.x1 };
    let rawName = it.t;
    let inlineValue: ParsedValue | null = null;
    if (!match) {
      const below = items.find(
        (b) =>
          b !== it &&
          b.cy - it.cy > 0.4 * H &&
          b.cy - it.cy < 1.8 * H &&
          Math.abs(b.x0 - it.x0) < 1.5 * H &&
          b.t.length <= 5 &&
          !/\d/.test(b.t) &&
          identify(b.t) === null,
      );
      const joined = below ? identify(it.t + below.t) : null;
      if (below && joined) {
        match = joined;
        span = { y0: it.y0, y1: below.y1, x1: Math.max(it.x1, below.x1) };
        rawName = it.t + below.t;
        used.add(below);
      }
    }
    if (!match) {
      // OCR sometimes merges the name and the result into one cell.
      const m = /^(.*?[^\d\s.<>≤≥])\s*([<>≤≥]?\s*\d+(?:\s*\.\s*\d+)?)\s*(\S*)$/.exec(toHalfWidth(it.t));
      if (m) {
        const n = identify(m[1]);
        const v = parseValue(m[2] + (m[3] ? " " + m[3] : ""));
        if (n && v) {
          match = n;
          rawName = m[1];
          inlineValue = v;
        }
      }
    }
    if (!match) continue;
    used.add(it);

    // 2. Find the result and unit on the same row.
    const cy = (span.y0 + span.y1) / 2;
    const tol = Math.max(0.75 * H, (span.y1 - span.y0) / 2);
    const row = items.filter(
      (b) => !used.has(b) && b !== it && Math.abs(b.cy - cy) <= tol && b.x0 >= it.x0 + 0.5 * H && b.cx > span.x1 - 0.5 * H,
    );
    const values = row
      .map((b) => ({ b, v: parseValue(b.t) }))
      .filter((e): e is { b: Item; v: ParsedValue } => e.v !== null);
    let chosen: { b?: Item; v: ParsedValue } | undefined = inlineValue ? { v: inlineValue } : undefined;
    if (!chosen && values.length) {
      const head = headerAbove(items, RESULT_HEADER, cy, H);
      if (head && values.length > 1) {
        chosen = values.reduce((a, b) => (Math.abs(b.b.cx - head.cx) < Math.abs(a.b.cx - head.cx) ? b : a));
      } else {
        // No header: the result is the first number after the name; reference ranges come later.
        chosen = values.reduce((a, b) => (b.b.x0 < a.b.x0 ? b : a));
      }
    }
    if (!chosen) continue;

    let rawUnit = chosen.v.unitText;
    if (!rawUnit) {
      const all = row.filter((b) => b !== chosen!.b && looksLikeUnit(b.t));
      const known = all.filter((b) => unitId(b.t) !== undefined);
      const units = known.length ? known : all;
      if (units.length) {
        const uh = headerAbove(items, UNIT_HEADER, cy, H);
        const pick = uh
          ? units.reduce((a, b) => (Math.abs(b.cx - uh.cx) < Math.abs(a.cx - uh.cx) ? b : a))
          : units.reduce((a, b) => (Math.abs(b.cy - cy) < Math.abs(a.cy - cy) ? b : a));
        rawUnit = pick.t;
      }
    }
    if (chosen.b) used.add(chosen.b);
    const unit = rawUnit ? unitId(rawUnit) : undefined;

    // 3. Sort out measurements that share a name.
    let id = match.id;
    if (match.ambiguous && id === "lymph") {
      const isPct = unit ? unit === "%" : chosen.v.value > 6;
      if (!isPct) id = "lymphAbs";
    }
    if (id === "rdw" && unit === "fL") id = "rdwSd";
    if (id === "rdwSd") {
      out.rdwSd.push(chosen.v.value);
      continue;
    }
    if (id === "lymphAbs") {
      out.lymphAbs.push(chosen.v.value);
      continue;
    }
    out.findings.push({
      id,
      value: chosen.v.value,
      qualifier: chosen.v.qualifier,
      unit,
      rawName,
      rawValue: chosen.b?.t ?? it.t,
      rawUnit,
      image,
    });
  }
  return out;
}

// ------------------------------------------------------- several images

export interface Combined {
  /** First finding for each marker, in upload order. */
  values: Partial<Record<MarkerId, Finding>>;
  /** Other values found for the same marker (e.g. two reports). */
  alternatives: Partial<Record<MarkerId, Finding[]>>;
  notes: NoteKind[];
}

export function combine(results: ParseResult[]): Combined {
  const values: Partial<Record<MarkerId, Finding>> = {};
  const alternatives: Partial<Record<MarkerId, Finding[]>> = {};
  const notes: NoteKind[] = [];
  for (const r of results) {
    for (const f of r.findings) {
      const cur = values[f.id];
      if (!cur) values[f.id] = f;
      else if (cur.value !== f.value) (alternatives[f.id] ??= []).push(f);
    }
  }
  if (!values.rdw && results.some((r) => r.rdwSd.length)) notes.push("rdwSdOnly");
  const abs = results.flatMap((r) => r.lymphAbs);
  if (!values.lymph && abs.length && values.wbc && !values.wbc.qualifier) {
    const wbc = values.wbc.unit === "/uL" ? values.wbc.value / 1000 : values.wbc.value;
    const pct = Math.round((abs[0] / wbc) * 1000) / 10;
    if (pct > 0 && pct < 100) {
      values.lymph = {
        id: "lymph",
        value: pct,
        unit: "%",
        rawName: "淋巴细胞绝对值 ÷ 白细胞",
        rawValue: `${abs[0]} / ${values.wbc.value}`,
      };
      notes.push("lymphFromAbsolute");
    }
  }
  return { values, alternatives, notes };
}

/** Age printed in a report header ("年龄：56岁", "Age: 45"), if any. */
export function findAge(boxes: OcrText[]): number | undefined {
  const items = prepare(boxes);
  const H = median(items.map((i) => i.h)) || 20;
  for (const it of items) {
    const t = toHalfWidth(it.t).replace(/\s/g, "");
    const inline = /(?:^|[^\d])(?:年龄|AGE)[:：]?(\d{1,3})(?:岁|Y|YRS|YEARS)?/i.exec(t);
    if (inline) return plausibleAge(+inline[1]);
    if (/^(年龄|AGE)[:：]?$/i.test(t)) {
      const next = items
        .filter((b) => b !== it && Math.abs(b.cy - it.cy) < 0.6 * H && b.x0 > it.x0)
        .sort((a, b) => a.x0 - b.x0)[0];
      const m = next && /^(\d{1,3})(岁|Y)?$/i.exec(toHalfWidth(next.t).replace(/\s/g, ""));
      if (m) return plausibleAge(+m[1]);
    }
  }
  return undefined;
}

function plausibleAge(a: number): number | undefined {
  return a >= 18 && a <= 110 ? a : undefined;
}
