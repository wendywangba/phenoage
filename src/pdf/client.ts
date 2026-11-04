// Read a whole report PDF in the browser.
// Pages with a text layer are read directly (fast, exact). Pages that are only
// images (scans) are rendered and sent through OCR.

import type { OcrText } from "../core/parse.ts";
import type { TextBox } from "../ocr/pipeline.ts";
import { itemsToBoxes, textAmount, type PdfTextItem } from "./text.ts";

type PdfJs = typeof import("pdfjs-dist/legacy/build/pdf.min.mjs");

const SCALE = 2; // page pixels per PDF point; A4 becomes about 1190×1684
const PAGE_GAP = 40;
const MIN_TEXT = 30; // fewer characters than this: treat the page as a scan

export interface PdfProgress {
  page: number;
  pages: number;
  /** Set while a scanned page is going through OCR (0–100). */
  ocrPct?: number;
}

export interface PdfResult {
  boxes: OcrText[];
  pages: number;
  /** Pages that needed OCR. */
  scanned: number;
  /** Pages we didn't need to read because everything was already found. */
  skipped: number;
}

export interface ReadPdfOptions {
  onProgress?: (p: PdfProgress) => void;
  /** OCR for a rendered page. Only called for pages without text. */
  ocr: (img: { width: number; height: number; data: Uint8ClampedArray<ArrayBuffer> }, onPct: (pct: number) => void) => Promise<TextBox[]>;
  /** Return true once nothing more is needed, so remaining scanned pages are skipped. */
  done?: (boxesSoFar: OcrText[]) => boolean;
}

let lib: Promise<PdfJs> | null = null;

function loadPdfJs(): Promise<PdfJs> {
  lib ??= import("pdfjs-dist/legacy/build/pdf.min.mjs").then((m) => {
    m.GlobalWorkerOptions.workerSrc = import.meta.env.BASE_URL + "pdfjs/pdf.worker.min.mjs";
    return m;
  });
  return lib;
}

export function isPdf(file: File): boolean {
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name);
}

export async function readPdf(file: Blob, opts: ReadPdfOptions): Promise<PdfResult> {
  const pdfjs = await loadPdfJs();
  const base = import.meta.env.BASE_URL + "pdfjs/";
  const task = pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    cMapUrl: base + "cmaps/",
    cMapPacked: true,
    standardFontDataUrl: base + "standard_fonts/",
    wasmUrl: base + "wasm/",
  });
  const doc = await task.promise;

  const pages = doc.numPages;
  const boxes: OcrText[] = [];
  let y = 0;
  let scanned = 0;
  let skipped = 0;
  try {
    for (let n = 1; n <= pages; n++) {
      opts.onProgress?.({ page: n, pages });
      const page = await doc.getPage(n);
      const viewport = page.getViewport({ scale: SCALE });
      const text = await page.getTextContent();
      const items = text.items.filter((i: object) => "str" in i) as unknown as PdfTextItem[];
      if (textAmount(items) >= MIN_TEXT) {
        boxes.push(...itemsToBoxes(items, viewport.transform, y));
      } else if (opts.done?.(boxes)) {
        skipped++;
      } else {
        scanned++;
        const img = await renderPage(page, viewport);
        const found = await opts.ocr(img, (pct) => opts.onProgress?.({ page: n, pages, ocrPct: pct }));
        for (const b of found) boxes.push({ ...b, y0: b.y0 + y, y1: b.y1 + y });
      }
      y += viewport.height + PAGE_GAP;
      page.cleanup();
    }
  } finally {
    await task.destroy();
  }
  return { boxes, pages, scanned, skipped };
}

async function renderPage(
  page: import("pdfjs-dist/legacy/build/pdf.min.mjs").PDFPageProxy,
  viewport: import("pdfjs-dist/legacy/build/pdf.min.mjs").PageViewport,
) {
  const width = Math.ceil(viewport.width);
  const height = Math.ceil(viewport.height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, width, height);
  await page.render({ canvas, canvasContext: ctx, viewport }).promise;
  const data = ctx.getImageData(0, 0, width, height).data;
  canvas.width = canvas.height = 0; // free the memory right away
  return { width, height, data };
}
