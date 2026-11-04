import { test } from "node:test";
import assert from "node:assert/strict";
import { itemsToBoxes, mergeRuns, textAmount, type PdfTextItem } from "../src/pdf/text.ts";

// pdf.js viewport transform for an A4 page (595×842 pt) at scale 2: flips y.
const VIEWPORT = [2, 0, 0, -2, 0, 842 * 2];

function item(str: string, x: number, baseline: number, size = 10, width?: number): PdfTextItem {
  return { str, transform: [size, 0, 0, size, x, 842 - baseline], width: width ?? str.length * size * 0.9, height: size };
}

test("text items become boxes in top-left page coordinates", () => {
  const [b] = itemsToBoxes([item("肌酐", 50, 100)], VIEWPORT);
  assert.equal(b.text, "肌酐");
  assert.equal(b.x0, 100);
  assert.equal(b.y1, 200); // baseline 100 pt from the top, at scale 2
  assert.equal(b.y0, 180); // 10 pt font
});

test("per-character items on one line are merged into cells, columns stay apart", () => {
  const chars = [..."白蛋白"].map((c, i) => item(c, 50 + i * 10, 100, 10, 10));
  const boxes = itemsToBoxes([...chars, item("44.2", 200, 100), item("g/L", 300, 100)], VIEWPORT);
  assert.deepEqual(
    boxes.map((b) => b.text),
    ["白蛋白", "44.2", "g/L"],
  );
});

test("words separated by one space stay in the same cell", () => {
  const boxes = mergeRuns([
    { text: "Alkaline", x0: 0, y0: 0, x1: 80, y1: 20 },
    { text: "Phosphatase", x0: 85, y0: 0, x1: 200, y1: 20 },
    { text: "71", x0: 400, y0: 0, x1: 420, y1: 20 },
  ]);
  assert.deepEqual(
    boxes.map((b) => b.text),
    ["Alkaline Phosphatase", "71"],
  );
});

test("page offset stacks pages and rotated text is ignored", () => {
  const rotated: PdfTextItem = { str: "样本", transform: [0, 10, -10, 0, 300, 400], width: 20, height: 10 };
  const boxes = itemsToBoxes([item("葡萄糖", 50, 100), rotated], VIEWPORT, 2000);
  assert.equal(boxes.length, 1);
  assert.equal(boxes[0].y1, 2200);
});

test("scanned pages have almost no text", () => {
  assert.equal(textAmount([item(" ", 0, 0), item("", 0, 0)]), 0);
  assert.equal(textAmount([item("血常规 白细胞", 0, 0)]), 6);
});
