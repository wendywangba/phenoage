import { test } from "node:test";
import assert from "node:assert/strict";
import { phenoAge, contributions, linearPredictor, type PhenoInputs } from "../src/core/phenoage.ts";
import { MARKER_IDS, MARKERS } from "../src/core/markers.ts";
import { toBase } from "../src/core/units.ts";

// Made-up example person, in the units the formula expects.
const person: PhenoInputs = {
  age: 45,
  albumin: 44,
  creatinine: 72,
  glucose: 5.3,
  crp: 1.8,
  lymph: 32,
  mcv: 91,
  rdw: 12.8,
  alp: 68,
  wbc: 5.9,
};

/** The formula exactly as printed in Liu et al. 2018, written independently of the app code. */
function published(x: PhenoInputs): number {
  const xb =
    -19.9067 -
    0.0336 * x.albumin +
    0.0095 * x.creatinine +
    0.1953 * x.glucose +
    0.0954 * Math.log(x.crp / 10) -
    0.012 * x.lymph +
    0.0268 * x.mcv +
    0.3306 * x.rdw +
    0.00188 * x.alp +
    0.0554 * x.wbc +
    0.0804 * x.age;
  const g = 0.0076927;
  const m = 1 - Math.exp((-Math.exp(xb) * (Math.exp(120 * g) - 1)) / g);
  return 141.50225 + Math.log(-0.00553 * Math.log(1 - m)) / 0.090165;
}

test("matches the published formula", () => {
  const variants: PhenoInputs[] = [
    person,
    { ...person, age: 25, rdw: 11.8, crp: 0.3 },
    { ...person, age: 70, glucose: 7.9, crp: 12, albumin: 36, rdw: 15.2 },
    { ...person, age: 58, creatinine: 130, alp: 140, wbc: 9.4 },
  ];
  for (const v of variants) {
    assert.ok(Math.abs(phenoAge(v).phenoAge - published(v)) < 1e-6, JSON.stringify(v));
  }
});

test("a typical healthy adult lands near their own age", () => {
  const r = phenoAge(person);
  assert.ok(r.phenoAge > 30 && r.phenoAge < 50, String(r.phenoAge));
  assert.equal(Math.round(r.difference * 1e9), Math.round((r.phenoAge - person.age) * 1e9));
  assert.ok(r.mortality > 0 && r.mortality < 0.1);
});

test("US units give the same answer once converted", () => {
  // Same person as printed on a US report.
  const us = {
    albumin: [4.4, "g/dL"],
    creatinine: [72 / 88.42, "mg/dL"],
    glucose: [5.3 * 18.016, "mg/dL"],
    crp: [0.18, "mg/dL"],
  } as const;
  const converted: PhenoInputs = { ...person };
  for (const [id, [v, u]] of Object.entries(us)) {
    converted[id as keyof typeof us] = toBase(id as keyof typeof us, v, u);
  }
  assert.ok(Math.abs(phenoAge(converted).phenoAge - phenoAge(person).phenoAge) < 1e-6);
});

test("forgetting to convert albumin and creatinine changes the result a lot", () => {
  // The bug in some online calculators: g/dL and mg/dL fed straight into the formula.
  const wrong = { ...person, albumin: 4.4, creatinine: 72 / 88.42 };
  assert.ok(Math.abs(phenoAge(wrong).phenoAge - phenoAge(person).phenoAge) > 5);
});

test("marker contributions add up to the difference from a typical adult", () => {
  const typical = { age: person.age } as PhenoInputs;
  for (const id of MARKER_IDS) typical[id] = MARKERS[id].typical;
  const c = contributions(person);
  const sum = Object.values(c).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - (phenoAge(person).phenoAge - phenoAge(typical).phenoAge)) < 1e-9);
  assert.ok(Math.abs(c.rdw - (0.3306 * (12.8 - 13)) / 0.090165) < 1e-9);
});

test("rejects missing or non-positive values", () => {
  assert.throws(() => phenoAge({ ...person, crp: 0 }));
  assert.throws(() => phenoAge({ ...person, wbc: NaN }));
});

test("linear predictor uses ln(CRP in mg/dL)", () => {
  const a = linearPredictor({ ...person, crp: 10 });
  const b = linearPredictor({ ...person, crp: 1 });
  assert.ok(Math.abs(a - b - 0.0954 * Math.log(10)) < 1e-12);
});

test("estimate with nothing missing is the exact result", async () => {
  const { estimatePhenoAge } = await import("../src/core/phenoage.ts");
  const { age, ...values } = person;
  const e = estimatePhenoAge(age, values);
  assert.equal(e.phenoAge, phenoAge(person).phenoAge);
  assert.equal(e.low, e.phenoAge);
  assert.equal(e.high, e.phenoAge);
  assert.deepEqual(e.missing, []);
});

test("missing CRP: typical value in the middle, normal range at the ends", async () => {
  const { estimatePhenoAge } = await import("../src/core/phenoage.ts");
  const { age, crp: _crp, ...values } = person;
  const e = estimatePhenoAge(age, values);
  const at = (crp: number) => phenoAge({ ...person, crp }).phenoAge;
  assert.deepEqual(e.missing, ["crp"]);
  assert.ok(Math.abs(e.phenoAge - at(MARKERS.crp.typical)) < 1e-9);
  assert.ok(Math.abs(e.low - at(MARKERS.crp.normal[0])) < 1e-9);
  assert.ok(Math.abs(e.high - at(MARKERS.crp.normal[1])) < 1e-9);
  assert.ok(e.high - e.low < 4, "CRP alone should give a narrow range");
});

test("missing albumin: a higher value means a younger result, so the range flips", async () => {
  const { estimatePhenoAge } = await import("../src/core/phenoage.ts");
  const { age, albumin: _a, ...values } = person;
  const e = estimatePhenoAge(age, values);
  assert.ok(Math.abs(e.low - phenoAge({ ...person, albumin: MARKERS.albumin.normal[1] }).phenoAge) < 1e-9);
  assert.ok(Math.abs(e.high - phenoAge({ ...person, albumin: MARKERS.albumin.normal[0] }).phenoAge) < 1e-9);
});

test("two missing markers: the ranges add up", async () => {
  const { estimatePhenoAge } = await import("../src/core/phenoage.ts");
  const { age, crp: _c, wbc: _w, ...values } = person;
  const both = estimatePhenoAge(age, values);
  const onlyCrp = estimatePhenoAge(age, { ...values, wbc: MARKERS.wbc.typical });
  const onlyWbc = estimatePhenoAge(age, { ...values, crp: MARKERS.crp.typical });
  const span = (e: { low: number; high: number }) => e.high - e.low;
  assert.ok(Math.abs(span(both) - span(onlyCrp) - span(onlyWbc)) < 1e-9);
  assert.ok(both.low <= both.phenoAge && both.phenoAge <= both.high);
});
