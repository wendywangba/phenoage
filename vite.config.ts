import { defineConfig, defaultClientConditions } from "vite";

export default defineConfig({
  base: "/phenoage/",
  // Load ONNX Runtime's WebAssembly from public/ocr (see scripts/copy-assets.mjs)
  // instead of bundling a second copy.
  resolve: { conditions: ["onnxruntime-web-use-extern-wasm", ...defaultClientConditions] },
  build: { target: "es2022", chunkSizeWarningLimit: 1500 },
  worker: { format: "es" },
});
