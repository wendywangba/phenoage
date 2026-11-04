// Run OCR + parsing on a folder of report screenshots, in Node.
// Usage: npm run ocr:samples -- <folder> [--json out.json] [--models dir]
// Sample reports contain personal health data: keep them outside the repo.

import { readdir, readFile, writeFile, stat } from "node:fs/promises";
import { join, extname } from "node:path";
import * as ort from "onnxruntime-node";
import sharp from "sharp";
import { ocr, parseKeys, type OcrModels, type RunModel } from "../src/ocr/pipeline.ts";

const argv = process.argv.slice(2);
// Defaults to the files the site serves (run `npm run assets` first).
const MODELS = argv.includes("--models") ? argv[argv.indexOf("--models") + 1] : "public/ocr";

async function loadModels(): Promise<OcrModels> {
  const mk = async (file: string): Promise<RunModel> => {
    const s = await ort.InferenceSession.create(join(MODELS, file));
    return async (t) => {
      const out = await s.run({ [s.inputNames[0]]: new ort.Tensor("float32", t.data, t.dims) });
      const o = out[s.outputNames[0]];
      return { data: o.data as Float32Array, dims: o.dims };
    };
  };
  return {
    det: await mk("det.onnx"),
    rec: await mk("rec.onnx"),
    keys: parseKeys(await readFile(join(MODELS, "keys.txt"), "utf8")),
  };
}

async function listImages(dir: string): Promise<string[]> {
  if (!(await stat(dir)).isDirectory()) return [dir];
  const out: string[] = [];
  for (const name of (await readdir(dir)).sort()) {
    const p = join(dir, name);
    if ((await stat(p)).isDirectory()) out.push(...(await listImages(p)));
    else if ([".png", ".jpg", ".jpeg", ".webp"].includes(extname(name).toLowerCase())) out.push(p);
  }
  return out;
}

const dir = argv[0];
const jsonOut = argv.includes("--json") ? argv[argv.indexOf("--json") + 1] : undefined;
if (!dir) {
  console.error("usage: npm run ocr:samples -- <folder> [--json out.json] [--models dir]");
  process.exit(1);
}

const models = await loadModels();
const dump: Record<string, unknown> = {};
for (const file of await listImages(dir)) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const t0 = performance.now();
  const boxes = await ocr({ width: info.width, height: info.height, data }, models);
  const ms = Math.round(performance.now() - t0);
  console.log(`\n=== ${file}  (${info.width}x${info.height}, ${boxes.length} boxes, ${ms} ms)`);
  for (const b of boxes) {
    console.log(
      `${String(Math.round(b.y0)).padStart(5)} ${String(Math.round(b.x0)).padStart(5)}  ${b.score.toFixed(2)}  ${b.text}`,
    );
  }
  dump[file] = { width: info.width, height: info.height, boxes };
}
if (jsonOut) await writeFile(jsonOut, JSON.stringify(dump, null, 1));
