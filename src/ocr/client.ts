// Main-thread side of OCR: decodes images and talks to the worker.
import type { TextBox } from "./pipeline.ts";
import type { WorkerRequest, WorkerResponse } from "./worker.ts";

const MAX_WIDTH = 1600;
const MAX_PIXELS = 12_000_000;

export interface OcrHooks {
  onDownload?: (loaded: number, total: number) => void;
}

let worker: Worker | null = null;
let ready: Promise<void> | null = null;
let nextId = 1;
const pending = new Map<
  number,
  { resolve: (b: TextBox[]) => void; reject: (e: Error) => void; onProgress?: (d: number, t: number) => void }
>();
let hooks: OcrHooks = {};

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
  worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
    const m = e.data;
    if (m.type === "download") hooks.onDownload?.(m.loaded, m.total);
    else if (m.type === "progress") pending.get(m.id)?.onProgress?.(m.done, m.total);
    else if (m.type === "result") {
      pending.get(m.id)?.resolve(m.boxes);
      pending.delete(m.id);
    } else if (m.type === "error" && m.id !== undefined) {
      pending.get(m.id)?.reject(new Error(m.message));
      pending.delete(m.id);
    }
  };
  return worker;
}

/** Start downloading the models. Safe to call more than once. */
export function initOcr(h: OcrHooks = {}): Promise<void> {
  hooks = h;
  if (ready) return ready;
  const w = getWorker();
  ready = new Promise<void>((resolve, reject) => {
    const onMsg = (e: MessageEvent<WorkerResponse>) => {
      if (e.data.type === "ready") {
        w.removeEventListener("message", onMsg);
        resolve();
      } else if (e.data.type === "error" && e.data.id === undefined) {
        w.removeEventListener("message", onMsg);
        ready = null;
        reject(new Error(e.data.message));
      }
    };
    w.addEventListener("message", onMsg);
    w.postMessage({ type: "init", base: import.meta.env.BASE_URL + "ocr/" } satisfies WorkerRequest);
  });
  return ready;
}

export async function recognizeFile(file: Blob, onProgress?: (done: number, total: number) => void): Promise<TextBox[]> {
  await initOcr(hooks);
  const img = await decodeImage(file);
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, onProgress });
    getWorker().postMessage(
      { type: "ocr", id, width: img.width, height: img.height, buffer: img.data.buffer } satisfies WorkerRequest,
      [img.data.buffer],
    );
  });
}

async function loadBitmap(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  try {
    return await createImageBitmap(file);
  } catch {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

export async function decodeImage(
  file: Blob,
): Promise<{ width: number; height: number; data: Uint8ClampedArray<ArrayBuffer> }> {
  const bmp = await loadBitmap(file);
  const w0 = "naturalWidth" in bmp ? bmp.naturalWidth : bmp.width;
  const h0 = "naturalHeight" in bmp ? bmp.naturalHeight : bmp.height;
  const s = Math.min(1, MAX_WIDTH / w0, Math.sqrt(MAX_PIXELS / (w0 * h0)));
  const w = Math.max(1, Math.round(w0 * s));
  const h = Math.max(1, Math.round(h0 * s));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext("2d", { willReadFrequently: true })!;
  g.fillStyle = "#fff";
  g.fillRect(0, 0, w, h);
  g.imageSmoothingQuality = "high";
  g.drawImage(bmp, 0, 0, w, h);
  if ("close" in bmp) bmp.close();
  const data = g.getImageData(0, 0, w, h).data;
  return { width: w, height: h, data };
}
