// Turn pdf.js text items into cell boxes the report parser understands.
// Pure functions, so they can be tested without a browser.

import type { OcrText } from "../core/parse.ts";

/** The parts of a pdf.js TextItem we use. */
export interface PdfTextItem {
  str: string;
  /** [a, b, c, d, e, f] in PDF user space. */
  transform: number[];
  width: number;
  height: number;
}

/** Multiply two 2D affine matrices (same layout as pdf.js Util.transform). */
function mul(m1: number[], m2: number[]): number[] {
  return [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
  ];
}

/**
 * Convert text items to boxes in page pixels (top-left origin), using the
 * viewport transform, then shift them down by `yOffset` so several pages can
 * be stacked into one tall "image".
 */
export function itemsToBoxes(items: PdfTextItem[], viewport: number[], yOffset = 0): OcrText[] {
  const scale = Math.hypot(viewport[0], viewport[1]);
  const out: OcrText[] = [];
  for (const it of items) {
    if (!it.str || !it.str.trim()) continue;
    const t = mul(viewport, it.transform);
    // skip rotated or vertical text (watermarks, stamps)
    if (Math.abs(t[1]) > 0.01 * Math.abs(t[0]) + 1e-6) continue;
    const h = Math.hypot(t[2], t[3]) || it.height * scale;
    const x0 = t[4];
    const y1 = t[5] + yOffset;
    out.push({ text: it.str, x0, y0: y1 - h, x1: x0 + it.width * scale, y1 });
  }
  return mergeRuns(out);
}

/**
 * Join pieces of text that sit next to each other on the same line into one
 * cell. Some PDFs store every character separately; table columns are far
 * enough apart that they stay separate.
 */
export function mergeRuns(boxes: OcrText[]): OcrText[] {
  const sorted = [...boxes].sort((a, b) => a.y1 - b.y1 || a.x0 - b.x0);
  // group into lines by baseline
  const lines: OcrText[][] = [];
  for (const b of sorted) {
    const h = b.y1 - b.y0;
    const line = lines.find((l) => Math.abs(l[0].y1 - b.y1) < 0.35 * h && Math.abs(l[0].y1 - l[0].y0 - h) < 0.4 * h);
    if (line) line.push(b);
    else lines.push([b]);
  }
  const out: OcrText[] = [];
  for (const line of lines) {
    line.sort((a, b) => a.x0 - b.x0);
    let cur: OcrText | null = null;
    for (const b of line) {
      const h = b.y1 - b.y0;
      const gap = cur ? b.x0 - cur.x1 : Infinity;
      // about one space or less: same cell; table columns are much further apart
      if (cur && gap < 0.5 * h) {
        const text: string = cur.text + (gap > 0.15 * h ? " " : "") + b.text;
        cur = { text, x0: cur.x0, y0: Math.min(cur.y0, b.y0), x1: Math.max(cur.x1, b.x1), y1: Math.max(cur.y1, b.y1) };
      } else {
        if (cur) out.push(cur);
        cur = { ...b };
      }
    }
    if (cur) out.push(cur);
  }
  return out;
}

/** Characters of real text on a page; scanned pages have (almost) none. */
export function textAmount(items: PdfTextItem[]): number {
  return items.reduce((n, it) => n + it.str.replace(/\s/g, "").length, 0);
}
