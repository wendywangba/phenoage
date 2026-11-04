// Copy the OCR models and the ONNX Runtime WebAssembly file into public/ocr,
// so the site serves everything itself (no third-party CDN).
import { copyFileSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const models = "node_modules/@gutenye/ocr-models/assets";
const ort = "node_modules/onnxruntime-web/dist";
const out = "public/ocr";
mkdirSync(out, { recursive: true });

const files = {
  det: [join(models, "ch_PP-OCRv4_det_infer.onnx"), "det.onnx"],
  rec: [join(models, "ch_PP-OCRv4_rec_infer.onnx"), "rec.onnx"],
  keys: [join(models, "ppocr_keys_v1.txt"), "keys.txt"],
  wasm: [join(ort, "ort-wasm-simd-threaded.wasm"), "ort-wasm-simd-threaded.wasm"],
  glue: [join(ort, "ort-wasm-simd-threaded.mjs"), "ort-wasm-simd-threaded.mjs"],
};
const manifest = {};
for (const [key, [src, name]] of Object.entries(files)) {
  copyFileSync(src, join(out, name));
  manifest[key] = { file: name, bytes: statSync(src).size };
}
writeFileSync(join(out, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log("OCR assets copied to", out);
