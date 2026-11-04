// Text detection + recognition with PaddleOCR (PP-OCRv4) models.
// Pure TypeScript: the caller supplies an RGBA image and functions that run
// the two ONNX models, so the same code runs in the browser and in Node tests.

export interface RGBAImage {
  width: number;
  height: number;
  data: Uint8ClampedArray | Uint8Array;
}

export interface Tensor {
  data: Float32Array;
  dims: readonly number[];
}

export type RunModel = (input: Tensor) => Promise<Tensor>;

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface TextBox extends Box {
  text: string;
  score: number;
}

export interface OcrModels {
  det: RunModel;
  rec: RunModel;
  /** Character list for the recognition model (without the CTC blank). */
  keys: string[];
}

export type Progress = (done: number, total: number) => void;

// ---------------------------------------------------------------- resizing

/** Resize an RGBA image. Uses area averaging when shrinking, bilinear when growing. */
export function resizeRGBA(src: RGBAImage, w: number, h: number): RGBAImage {
  const out = new Uint8ClampedArray(w * h * 4);
  const sx = src.width / w;
  const sy = src.height / h;
  const sd = src.data;
  const sw = src.width;
  if (sx >= 1 && sy >= 1) {
    for (let y = 0; y < h; y++) {
      const fy0 = y * sy;
      const fy1 = fy0 + sy;
      const iy0 = Math.floor(fy0);
      const iy1 = Math.min(src.height, Math.ceil(fy1));
      for (let x = 0; x < w; x++) {
        const fx0 = x * sx;
        const fx1 = fx0 + sx;
        const ix0 = Math.floor(fx0);
        const ix1 = Math.min(sw, Math.ceil(fx1));
        let r = 0, g = 0, b = 0, a = 0, wsum = 0;
        for (let yy = iy0; yy < iy1; yy++) {
          const wy = Math.min(yy + 1, fy1) - Math.max(yy, fy0);
          for (let xx = ix0; xx < ix1; xx++) {
            const wx = Math.min(xx + 1, fx1) - Math.max(xx, fx0);
            const wgt = wx * wy;
            const i = (yy * sw + xx) * 4;
            r += sd[i] * wgt;
            g += sd[i + 1] * wgt;
            b += sd[i + 2] * wgt;
            a += sd[i + 3] * wgt;
            wsum += wgt;
          }
        }
        const o = (y * w + x) * 4;
        out[o] = r / wsum;
        out[o + 1] = g / wsum;
        out[o + 2] = b / wsum;
        out[o + 3] = a / wsum;
      }
    }
    return { width: w, height: h, data: out };
  }
  for (let y = 0; y < h; y++) {
    const fy = Math.max(0, Math.min(src.height - 1, (y + 0.5) * sy - 0.5));
    const y0 = Math.floor(fy);
    const y1 = Math.min(src.height - 1, y0 + 1);
    const dy = fy - y0;
    for (let x = 0; x < w; x++) {
      const fx = Math.max(0, Math.min(sw - 1, (x + 0.5) * sx - 0.5));
      const x0 = Math.floor(fx);
      const x1 = Math.min(sw - 1, x0 + 1);
      const dx = fx - x0;
      const i00 = (y0 * sw + x0) * 4;
      const i01 = (y0 * sw + x1) * 4;
      const i10 = (y1 * sw + x0) * 4;
      const i11 = (y1 * sw + x1) * 4;
      const o = (y * w + x) * 4;
      for (let c = 0; c < 4; c++) {
        const top = sd[i00 + c] * (1 - dx) + sd[i01 + c] * dx;
        const bot = sd[i10 + c] * (1 - dx) + sd[i11 + c] * dx;
        out[o + c] = top * (1 - dy) + bot * dy;
      }
    }
  }
  return { width: w, height: h, data: out };
}

function crop(src: RGBAImage, b: Box): RGBAImage {
  const x0 = Math.max(0, Math.floor(b.x0));
  const y0 = Math.max(0, Math.floor(b.y0));
  const x1 = Math.min(src.width, Math.ceil(b.x1));
  const y1 = Math.min(src.height, Math.ceil(b.y1));
  const w = Math.max(1, x1 - x0);
  const h = Math.max(1, y1 - y0);
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const s = ((y0 + y) * src.width + x0) * 4;
    out.set(src.data.subarray(s, s + w * 4), y * w * 4);
  }
  return { width: w, height: h, data: out };
}

/** Paint transparent pixels white so screenshots with alpha behave like paper. */
export function flattenAlpha(img: RGBAImage): RGBAImage {
  const d = img.data;
  let hasAlpha = false;
  for (let i = 3; i < d.length; i += 4) {
    if (d[i] !== 255) {
      hasAlpha = true;
      break;
    }
  }
  if (!hasAlpha) return img;
  const out = new Uint8ClampedArray(d.length);
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3] / 255;
    out[i] = d[i] * a + 255 * (1 - a);
    out[i + 1] = d[i + 1] * a + 255 * (1 - a);
    out[i + 2] = d[i + 2] * a + 255 * (1 - a);
    out[i + 3] = 255;
  }
  return { width: img.width, height: img.height, data: out };
}

// --------------------------------------------------------------- detection

const DET_MEAN = [0.485, 0.456, 0.406];
const DET_STD = [0.229, 0.224, 0.225];
const DET_TILE = 1536; // tall screenshots are cut into tiles of this height
const DET_OVERLAP = 160;
const BIN_THRESH = 0.3;
const BOX_THRESH = 0.5;
const UNCLIP_RATIO = 1.6;

/** Pick the size the detector sees: text should end up roughly 15–40 px tall. */
export function detScale(width: number): number {
  const target = Math.min(1280, Math.max(800, width));
  return target / width;
}

function toDetTensor(img: RGBAImage, y0: number, h: number): Tensor {
  const w = img.width;
  const plane = w * h;
  const data = new Float32Array(3 * plane);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = ((y0 + y) * w + x) * 4;
      const p = y * w + x;
      // Paddle models are trained on BGR input.
      data[p] = (d[i + 2] / 255 - DET_MEAN[0]) / DET_STD[0];
      data[plane + p] = (d[i + 1] / 255 - DET_MEAN[1]) / DET_STD[1];
      data[2 * plane + p] = (d[i] / 255 - DET_MEAN[2]) / DET_STD[2];
    }
  }
  return { data, dims: [1, 3, h, w] };
}

/** Turn the probability map into axis-aligned text boxes (DB post-processing). */
export function boxesFromProbMap(prob: Float32Array, w: number, h: number): Box[] {
  const n = w * h;
  const label = new Int32Array(n);
  const stack = new Int32Array(n);
  const boxes: Box[] = [];
  let next = 1;
  for (let start = 0; start < n; start++) {
    if (label[start] !== 0 || prob[start] <= BIN_THRESH) continue;
    let top = 0;
    stack[top++] = start;
    label[start] = next;
    let minX = w, minY = h, maxX = -1, maxY = -1, sum = 0, count = 0;
    while (top > 0) {
      const p = stack[--top];
      const x = p % w;
      const y = (p - x) / w;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      sum += prob[p];
      count++;
      if (x > 0 && label[p - 1] === 0 && prob[p - 1] > BIN_THRESH) { label[p - 1] = next; stack[top++] = p - 1; }
      if (x < w - 1 && label[p + 1] === 0 && prob[p + 1] > BIN_THRESH) { label[p + 1] = next; stack[top++] = p + 1; }
      if (y > 0 && label[p - w] === 0 && prob[p - w] > BIN_THRESH) { label[p - w] = next; stack[top++] = p - w; }
      if (y < h - 1 && label[p + w] === 0 && prob[p + w] > BIN_THRESH) { label[p + w] = next; stack[top++] = p + w; }
    }
    next++;
    const bw = maxX - minX + 1;
    const bh = maxY - minY + 1;
    if (Math.min(bw, bh) < 3) continue;
    if (sum / count < BOX_THRESH) continue;
    // DB shrinks text regions during training; grow them back.
    const d = (bw * bh * UNCLIP_RATIO) / (2 * (bw + bh));
    boxes.push({ x0: minX - d, y0: minY - d, x1: maxX + 1 + d, y1: maxY + 1 + d });
  }
  return boxes;
}

function iou(a: Box, b: Box): number {
  const ix = Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0));
  const iy = Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
  const inter = ix * iy;
  const ua = (a.x1 - a.x0) * (a.y1 - a.y0) + (b.x1 - b.x0) * (b.y1 - b.y0) - inter;
  return ua > 0 ? inter / ua : 0;
}

export async function detect(img: RGBAImage, run: RunModel): Promise<Box[]> {
  const s = detScale(img.width);
  const w = Math.max(32, Math.round((img.width * s) / 32) * 32);
  const fullH = Math.max(32, Math.round((img.height * s) / 32) * 32);
  const scaled = resizeRGBA(img, w, fullH);
  const sx = img.width / w;
  const sy = img.height / fullH;

  const tiles: number[] = [];
  if (fullH <= DET_TILE) tiles.push(0);
  else {
    for (let y = 0; ; y += DET_TILE - DET_OVERLAP) {
      if (y + DET_TILE >= fullH) {
        tiles.push(fullH - DET_TILE);
        break;
      }
      tiles.push(y);
    }
  }
  const tileH = Math.min(DET_TILE, fullH);

  const all: { box: Box; edge: boolean }[] = [];
  for (const ty of tiles) {
    const out = await run(toDetTensor(scaled, ty, tileH));
    const oh = out.dims[2];
    const ow = out.dims[3];
    for (const b of boxesFromProbMap(out.data, ow, oh)) {
      // Boxes cut by a tile border are unreliable; prefer the copy from the other tile.
      const edge = (ty > 0 && b.y0 < 4) || (ty + tileH < fullH && b.y1 > tileH - 4);
      all.push({
        box: { x0: b.x0 * sx, y0: (b.y0 + ty) * sy, x1: b.x1 * sx, y1: (b.y1 + ty) * sy },
        edge,
      });
    }
  }

  // Drop duplicates found in two overlapping tiles.
  all.sort((a, b) => Number(a.edge) - Number(b.edge));
  const kept: Box[] = [];
  for (const { box } of all) {
    if (kept.some((k) => iou(k, box) > 0.3)) continue;
    kept.push({
      x0: Math.max(0, box.x0),
      y0: Math.max(0, box.y0),
      x1: Math.min(img.width, box.x1),
      y1: Math.min(img.height, box.y1),
    });
  }
  kept.sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
  return kept;
}

// ------------------------------------------------------------- recognition

const REC_H = 48;
const REC_MIN_W = 320;
const REC_MAX_W = 1600;
const REC_BATCH = 8;

function recWidth(b: Box): number {
  const ratio = (b.x1 - b.x0) / Math.max(1, b.y1 - b.y0);
  return Math.min(REC_MAX_W, Math.max(8, Math.ceil(REC_H * ratio)));
}

function fillRecTensor(data: Float32Array, offset: number, img: RGBAImage, batchW: number) {
  const plane = REC_H * batchW;
  const d = img.data;
  for (let y = 0; y < REC_H; y++) {
    for (let x = 0; x < img.width; x++) {
      const i = (y * img.width + x) * 4;
      const p = offset + y * batchW + x;
      data[p] = (d[i + 2] / 255 - 0.5) / 0.5;
      data[plane + p] = (d[i + 1] / 255 - 0.5) / 0.5;
      data[2 * plane + p] = (d[i] / 255 - 0.5) / 0.5;
    }
  }
}

export function ctcDecode(probs: Float32Array, steps: number, classes: number, start: number, keys: string[]) {
  let text = "";
  let scoreSum = 0;
  let kept = 0;
  let prev = -1;
  for (let t = 0; t < steps; t++) {
    const base = start + t * classes;
    let best = 0;
    let bestP = probs[base];
    for (let c = 1; c < classes; c++) {
      const v = probs[base + c];
      if (v > bestP) {
        bestP = v;
        best = c;
      }
    }
    if (best !== 0 && best !== prev) {
      text += keys[best - 1] ?? " ";
      scoreSum += bestP;
      kept++;
    }
    prev = best;
  }
  return { text: text.trim(), score: kept ? scoreSum / kept : 0 };
}

export async function recognize(
  img: RGBAImage,
  boxes: Box[],
  models: OcrModels,
  onProgress?: Progress,
): Promise<TextBox[]> {
  // Similar widths go in the same batch, which keeps padding small.
  const order = boxes.map((b, i) => ({ b, i, w: recWidth(b) })).sort((a, b) => a.w - b.w);
  const results: TextBox[] = new Array(boxes.length);
  let done = 0;
  for (let s = 0; s < order.length; s += REC_BATCH) {
    const batch = order.slice(s, s + REC_BATCH);
    const batchW = Math.max(REC_MIN_W, ...batch.map((e) => e.w));
    const plane = REC_H * batchW;
    const data = new Float32Array(batch.length * 3 * plane);
    batch.forEach((e, k) => {
      const piece = resizeRGBA(crop(img, e.b), e.w, REC_H);
      fillRecTensor(data, k * 3 * plane, piece, batchW);
    });
    const out = await models.rec({ data, dims: [batch.length, 3, REC_H, batchW] });
    const [, steps, classes] = out.dims;
    batch.forEach((e, k) => {
      const r = ctcDecode(out.data, steps, classes, k * steps * classes, models.keys);
      results[e.i] = { ...e.b, ...r };
    });
    done += batch.length;
    onProgress?.(done, boxes.length);
  }
  return results;
}

export async function ocr(img: RGBAImage, models: OcrModels, onProgress?: Progress): Promise<TextBox[]> {
  const flat = flattenAlpha(img);
  const boxes = await detect(flat, models.det);
  const texts = await recognize(flat, boxes, models, onProgress);
  return texts.filter((t) => t.text.length > 0);
}

/** Parse the dictionary file shipped with the recognition model. */
export function parseKeys(raw: string): string[] {
  const keys = raw.split(/\r?\n/);
  if (keys.length && keys[keys.length - 1] === "") keys.pop();
  keys.push(" "); // the model was trained with an extra space character
  return keys;
}
