// Runs OCR off the main thread so the page stays responsive.
import * as ort from "onnxruntime-web/wasm";
import { ocr, parseKeys, type OcrModels, type RunModel } from "./pipeline.ts";

export type WorkerRequest =
  | { type: "init"; base: string }
  | { type: "ocr"; id: number; width: number; height: number; buffer: ArrayBuffer };

export type WorkerResponse =
  | { type: "download"; loaded: number; total: number }
  | { type: "ready" }
  | { type: "progress"; id: number; done: number; total: number }
  | { type: "result"; id: number; boxes: import("./pipeline.ts").TextBox[] }
  | { type: "error"; id?: number; message: string };

interface Manifest {
  [k: string]: { file: string; bytes: number };
}

const ctx = self as unknown as {
  postMessage(msg: WorkerResponse): void;
  onmessage: ((e: MessageEvent<WorkerRequest>) => void) | null;
};

let models: Promise<OcrModels> | null = null;

async function fetchAll(base: string, onProgress: (loaded: number, total: number) => void) {
  const manifest: Manifest = await (await fetch(base + "manifest.json")).json();
  const keys = ["wasm", "det", "rec", "keys"];
  const total = keys.reduce((a, k) => a + manifest[k].bytes, 0);
  let loaded = 0;
  const out: Record<string, ArrayBuffer> = {};
  await Promise.all(
    keys.map(async (k) => {
      const res = await fetch(base + manifest[k].file);
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status} for ${manifest[k].file}`);
      const reader = res.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        size += value.length;
        loaded += value.length;
        onProgress(Math.min(loaded, total), total);
      }
      const buf = new Uint8Array(size);
      let off = 0;
      for (const c of chunks) {
        buf.set(c, off);
        off += c.length;
      }
      out[k] = buf.buffer;
    }),
  );
  return out;
}

async function load(base: string): Promise<OcrModels> {
  const files = await fetchAll(base, (loaded, total) => ctx.postMessage({ type: "download", loaded, total }));
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.wasmBinary = files.wasm;
  ort.env.wasm.wasmPaths = base;
  const session = async (buf: ArrayBuffer): Promise<RunModel> => {
    const s = await ort.InferenceSession.create(buf, { executionProviders: ["wasm"] });
    return async (t) => {
      const out = await s.run({ [s.inputNames[0]]: new ort.Tensor("float32", t.data, t.dims) });
      const o = out[s.outputNames[0]];
      return { data: o.data as Float32Array, dims: o.dims };
    };
  };
  return {
    det: await session(files.det),
    rec: await session(files.rec),
    keys: parseKeys(new TextDecoder().decode(files.keys)),
  };
}

ctx.onmessage = async (e) => {
  const msg = e.data;
  try {
    if (msg.type === "init") {
      models ??= load(msg.base);
      await models;
      ctx.postMessage({ type: "ready" });
    } else if (msg.type === "ocr") {
      if (!models) throw new Error("OCR is not initialized");
      const m = await models;
      const img = { width: msg.width, height: msg.height, data: new Uint8ClampedArray(msg.buffer) };
      const boxes = await ocr(img, m, (done, total) => ctx.postMessage({ type: "progress", id: msg.id, done, total }));
      ctx.postMessage({ type: "result", id: msg.id, boxes });
    }
  } catch (err) {
    if (msg.type === "init") models = null;
    ctx.postMessage({
      type: "error",
      id: msg.type === "ocr" ? msg.id : undefined,
      message: err instanceof Error ? err.message : String(err),
    });
  }
};
