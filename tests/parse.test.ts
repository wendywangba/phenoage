import { test } from "node:test";
import assert from "node:assert/strict";
import { parseReport, combine, identify, parseValue, type OcrText } from "../src/core/parse.ts";
import { chooseUnit } from "../src/core/units.ts";
import { unitId } from "../src/core/markers.ts";

// Fake OCR output. Each cell is [x, text]; rows are `pitch` pixels apart, text is `h` tall.
function table(rows: (readonly [number, string])[][], opts: { pitch?: number; h?: number; y0?: number } = {}): OcrText[] {
  const { pitch = 60, h = 24, y0 = 0 } = opts;
  const out: OcrText[] = [];
  rows.forEach((cells, r) => {
    for (const [x, text] of cells) {
      const y = y0 + r * pitch;
      const w = [...text].reduce((a, ch) => a + (ch.charCodeAt(0) < 128 ? 0.55 : 1) * h, 0);
      out.push({ text, x0: x, y0: y, x1: x + w, y1: y + h });
    }
  });
  return out;
}

function values(boxes: OcrText[]) {
  const c = combine([parseReport(boxes)]);
  return Object.fromEntries(Object.entries(c.values).map(([k, f]) => [k, f!.value]));
}

test("app-style report: name | result | range | unit, with a wrapped name", () => {
  const rows = table(
    [
      [[20, "项目名称"], [300, "检查结果"], [500, "参考范围"], [700, "单位"], [900, "提示"]],
      [[20, "白细胞计数"], [300, "6.3"], [500, "3.5--9.5"], [700, "10^9/L"]],
      [[20, "红细胞体积分布宽"], [300, ""], [500, ""]],
      [[20, "平均红细胞体积"], [300, "88.6"], [500, "82--100"], [700, "fl"]],
      [[20, "淋巴细胞百分率"], [300, "35.5"], [500, "20--50"], [700, "%"]],
    ],
    { pitch: 80 },
  );
  // The wrapped RDW row: first line above the value, second line below.
  rows.push({ text: "度", x0: 20, y0: 160 + 30, x1: 44, y1: 160 + 54 });
  rows.push({ text: "12.4", x0: 300, y0: 160 + 15, x1: 360, y1: 160 + 39 });
  rows.push({ text: "0-14", x0: 500, y0: 160 + 15, x1: 560, y1: 160 + 39 });
  rows.push({ text: "%", x0: 700, y0: 160 + 15, x1: 720, y1: 160 + 39 });
  assert.deepEqual(values(rows), { wbc: 6.3, rdw: 12.4, mcv: 88.6, lymph: 35.5 });
});

test("printed report: name | result | unit | flag | range, dense rows", () => {
  const boxes = table(
    [
      [[20, "检验项目"], [210, "本次结果"], [310, "单位"], [400, "异常标志"], [520, "参考值"]],
      [[20, "淋巴细胞百分比"], [226, "38. 20"], [308, "%"], [526, "20-50"]],
      [[20, "淋巴细胞绝对值"], [229, "2. 10"], [309, "10~9/L"], [518, "1. 1-3. 2"]],
      [[20, "平均红细胞体积"], [226, "86.10"], [308, "fL"], [521, "82-100"]],
      [[20, "红细胞分布宽度CV"], [226, "12. 70"], [308, "%"], [526, "10-18"]],
      [[20, "尿素氮（BUN)"], [232, "5. 1"], [307, "mmol/L"], [519, "2.86-8.20"]],
      [[20, "肌酐（CREA）"], [229, "66.0"], [307, "umol/L"], [529, "41-73"]],
      [[20, "葡萄糖（GLU)"], [229, "5.02"], [307, "mmol/L"], [519, "3.90-6.10"]],
    ],
    { pitch: 21, h: 18 },
  );
  assert.deepEqual(values(boxes), { lymph: 38.2, mcv: 86.1, rdw: 12.7, creatinine: 66, glucose: 5.02 });
});

test("phone screenshot: name | unit | result | range, decorated and wrapped names", () => {
  const boxes = table(
    [
      [[20, "检验项目"], [98, "单位"], [151, "结果"], [211, "参考值"], [283, "状态"]],
      [[18, "△*总蛋白"], [100, "g/L"], [151, "71.2"], [211, "65--85"]],
      [[17, "△*白蛋白"], [100, "g/L"], [150, "45.6"], [210, "40--55"]],
      [[27, "白球比"], [155, "1.8"], [200, "1.20--2.40"]],
      [[12, "△*碱性磷酸"], [99, "U/L"], [156, "64"], [208, "30--120"]],
      [[38, "酶"]],
      [[24, "△*肌酐"], [91, "umol/L"], [151, "70.5"], [209, "41--100"]],
      [[18, "*葡萄糖"], [89, "mmol/L"], [152, "4.95"], [205, "3.88--6.1"]],
    ],
    { pitch: 42, h: 16 },
  );
  // Put the "酶" line right under "碱性磷酸".
  const tail = boxes.find((b) => b.text === "酶")!;
  tail.y0 -= 24;
  tail.y1 -= 24;
  assert.deepEqual(values(boxes), { albumin: 45.6, alp: 64, creatinine: 70.5, glucose: 4.95 });
});

test("US-style report in English", () => {
  const boxes = table([
    [[20, "Test"], [400, "Result"], [550, "Units"], [700, "Reference Interval"]],
    [[20, "WBC"], [400, "6.2"], [550, "x10E3/uL"], [700, "3.4-10.8"]],
    [[20, "Lymphs"], [400, "31"], [550, "%"], [700, "Not Estab."]],
    [[20, "MCV"], [400, "88"], [550, "fL"], [700, "79-97"]],
    [[20, "RDW"], [400, "12.9"], [550, "%"], [700, "11.6-15.4"]],
    [[20, "Glucose"], [400, "91"], [550, "mg/dL"], [700, "65-99"]],
    [[20, "Creatinine"], [400, "0.86"], [550, "mg/dL"], [700, "0.57-1.00"]],
    [[20, "Albumin"], [400, "4.6"], [550, "g/dL"], [700, "3.8-4.8"]],
    [[20, "Alkaline Phosphatase"], [400, "71"], [550, "IU/L"], [700, "44-121"]],
    [[20, "C-Reactive Protein, Cardiac"], [400, "0.9"], [550, "mg/L"], [700, "0.0-3.0"]],
  ]);
  const c = combine([parseReport(boxes)]);
  const got = Object.fromEntries(Object.entries(c.values).map(([k, f]) => [k, [f!.value, f!.unit]]));
  assert.deepEqual(got, {
    wbc: [6.2, "10^9/L"],
    lymph: [31, "%"],
    mcv: [88, "fL"],
    rdw: [12.9, "%"],
    glucose: [91, "mg/dL"],
    creatinine: [0.86, "mg/dL"],
    albumin: [4.6, "g/dL"],
    alp: [71, "U/L"],
    crp: [0.9, "mg/L"],
  });
});

test("CRP below the detection limit keeps the '<'", () => {
  const r = parseReport(table([[[20, "超敏C反应蛋白(hs-CRP)"], [300, "<0.50"], [450, "mg/L"], [600, "0-3"]]]));
  assert.equal(r.findings[0].id, "crp");
  assert.equal(r.findings[0].value, 0.5);
  assert.equal(r.findings[0].qualifier, "<");
});

test("does not confuse look-alike tests", () => {
  for (const name of ["前白蛋白", "尿微量白蛋白", "白/球比例", "糖化白蛋白", "肌酐清除率", "餐后2小时血糖", "糖化血红蛋白", "平均红细胞血红蛋白量", "白细胞酯酶", "尿白细胞"]) {
    assert.equal(identify(name), null, name);
  }
  assert.deepEqual(identify("红细胞分布宽度-SD"), { id: "rdwSd" });
  assert.deepEqual(identify("淋巴细胞绝对值"), { id: "lymphAbs" });
  assert.deepEqual(identify("肌酐(酶法)(CREA)"), { id: "creatinine" });
  assert.deepEqual(identify("Y-谷氨酰基转移酶"), null);
});

test("only RDW-SD on the report is flagged", () => {
  const c = combine([parseReport(table([[[20, "RDW-SD"], [300, "41.2"], [450, "fL"]]]))]);
  assert.equal(c.values.rdw, undefined);
  assert.deepEqual(c.notes, ["rdwSdOnly"]);
});

test("lymphocyte % can come from the absolute count and WBC", () => {
  const c = combine([
    parseReport(table([[[20, "白细胞计数"], [300, "5.0"], [450, "10^9/L"]], [[20, "淋巴细胞绝对值"], [300, "1.60"], [450, "10^9/L"]]])),
  ]);
  assert.equal(c.values.lymph?.value, 32);
  assert.deepEqual(c.notes, ["lymphFromAbsolute"]);
});

test("values from several screenshots are merged; a second, different value is kept as an alternative", () => {
  const a = parseReport(table([[[20, "葡萄糖"], [300, "4.9"], [450, "mmol/L"]]]), 0);
  const b = parseReport(table([[[20, "葡萄糖"], [300, "5.4"], [450, "mmol/L"]], [[20, "肌酐"], [300, "70"], [450, "umol/L"]]]), 1);
  const c = combine([a, b]);
  assert.equal(c.values.glucose?.value, 4.9);
  assert.equal(c.values.creatinine?.image, 1);
  assert.deepEqual(c.alternatives.glucose?.map((f) => f.value), [5.4]);
});

test("value cells", () => {
  assert.deepEqual(parseValue("41. 40"), { value: 41.4, qualifier: undefined, unitText: undefined });
  assert.deepEqual(parseValue("5.11 ↑"), { value: 5.11, qualifier: undefined, unitText: undefined });
  assert.equal(parseValue("82--100"), null);
  assert.equal(parseValue("1. 13. 2"), null);
  assert.equal(parseValue("10~9/L"), null);
  assert.equal(parseValue("5项异常"), null);
  assert.deepEqual(parseValue("≤0.3 mg/L"), { value: 0.3, qualifier: "<", unitText: "mg/L" });
});

test("unit strings as OCR reads them", () => {
  assert.equal(unitId("10~9/L"), "10^9/L");
  assert.equal(unitId("×10⁹/L"), "10^9/L");
  assert.equal(unitId("x10E3/uL"), "10^9/L");
  assert.equal(unitId("μmol/L"), "umol/L");
  assert.equal(unitId("fl"), "fL");
  assert.equal(unitId("IU/L"), "U/L");
  assert.equal(unitId("82--100"), undefined);
});

test("unit guessing from the value", () => {
  assert.equal(chooseUnit("albumin", 45).unit.id, "g/L");
  assert.equal(chooseUnit("albumin", 4.5).unit.id, "g/dL");
  assert.equal(chooseUnit("creatinine", 0.9).unit.id, "mg/dL");
  assert.equal(chooseUnit("glucose", 95).unit.id, "mg/dL");
  assert.equal(chooseUnit("wbc", 6500).unit.id, "/uL");
  const c = chooseUnit("albumin", 4.2, "g/L");
  assert.equal(c.unit.id, "g/dL");
  assert.equal(c.conflict, true);
  assert.equal(chooseUnit("crp", 2).unit.id, "mg/L");
});

test("reads the age from a report header", async () => {
  const { findAge } = await import("../src/core/parse.ts");
  assert.equal(findAge(table([[[20, "姓名：***"], [300, "性别：女"], [500, "年龄：56岁"]]])), 56);
  assert.equal(findAge(table([[[20, "年龄"], [120, "34 岁"]]])), 34);
  assert.equal(findAge(table([[[20, "Age: 45"]]])), 45);
  assert.equal(findAge(table([[[20, "白细胞计数"], [300, "6.1"]]])), undefined);
});

test("urine and stool sections are skipped in a full report", () => {
  const boxes = table([
    [[20, "尿常规"]],
    [[20, "项目名称"], [300, "结果"], [450, "单位"]],
    [[20, "白细胞"], [300, "15.3"], [450, "/μL"]],
    [[20, "葡萄糖"], [300, "阴性(-)"]],
    [[20, "血常规"]],
    [[20, "白细胞计数(WBC)"], [300, "5.84"], [450, "10^9/L"]],
    [[20, "生化"]],
    [[20, "葡萄糖"], [300, "5.12"], [450, "mmol/L"]],
    [[20, "粪便常规"]],
    [[20, "白细胞"], [300, "2"], [450, "/HP"]],
  ]);
  assert.deepEqual(values(boxes), { wbc: 5.84, glucose: 5.12 });
});

test("a value that only makes sense for urine loses to a plausible blood value", () => {
  // no section titles this time, so only the unit check can tell them apart
  const a = parseReport(table([[[20, "白细胞"], [300, "15.3"], [450, "/μL"]]]), 0);
  const b = parseReport(table([[[20, "白细胞计数"], [300, "5.84"], [450, "10^9/L"]]]), 1);
  const c = combine([a, b]);
  assert.equal(c.values.wbc?.value, 5.84);
});
