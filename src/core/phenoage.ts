// Phenotypic Age (PhenoAge), from Levine et al. 2018 (Aging 10:573) and
// Liu et al. 2018 (PLoS Med 15:e1002718). Inputs are in the units below.

import { MARKER_IDS, MARKERS, type MarkerId } from "./markers.ts";

export interface PhenoInputs {
  age: number; // years
  albumin: number; // g/L
  creatinine: number; // µmol/L
  glucose: number; // mmol/L
  crp: number; // mg/L (the model uses ln of mg/dL; converted below)
  lymph: number; // %
  mcv: number; // fL
  rdw: number; // %
  alp: number; // U/L
  wbc: number; // 10^9/L
}

export const COEF = {
  intercept: -19.9067,
  age: 0.0804,
  albumin: -0.0336,
  creatinine: 0.0095,
  glucose: 0.1953,
  lnCrp: 0.0954,
  lymph: -0.012,
  mcv: 0.0268,
  rdw: 0.3306,
  alp: 0.00188,
  wbc: 0.0554,
} as const;

const GAMMA = 0.0076927;
const TEN_YEARS = 120; // months
const HAZARD = (Math.exp(TEN_YEARS * GAMMA) - 1) / GAMMA;

/** ln(CRP in mg/dL), from CRP in mg/L. */
function lnCrp(crpMgL: number): number {
  return Math.log(crpMgL / 10);
}

/** Term each marker adds to the linear predictor. */
function markerTerm(id: MarkerId, v: number): number {
  switch (id) {
    case "crp":
      return COEF.lnCrp * lnCrp(v);
    default:
      return COEF[id] * v;
  }
}

export function linearPredictor(x: PhenoInputs): number {
  let xb = COEF.intercept + COEF.age * x.age;
  for (const id of MARKER_IDS) xb += markerTerm(id, x[id]);
  return xb;
}

export interface PhenoResult {
  phenoAge: number;
  /** PhenoAge minus chronological age. Negative means "younger" than the calendar says. */
  difference: number;
  /** Model's 10-year mortality score, 0–1. */
  mortality: number;
}

export function validateInputs(x: PhenoInputs): string[] {
  const bad: string[] = [];
  for (const [k, v] of Object.entries(x)) {
    if (!Number.isFinite(v) || v <= 0) bad.push(k);
  }
  return bad;
}

export function phenoAge(x: PhenoInputs): PhenoResult {
  const bad = validateInputs(x);
  if (bad.length) throw new Error(`Invalid inputs: ${bad.join(", ")}`);
  const xb = linearPredictor(x);
  const risk = Math.exp(xb) * HAZARD;
  // 1 - M = exp(-risk), so the published formula
  //   141.50225 + ln(-0.00553 * ln(1 - M)) / 0.090165
  // simplifies to the line below, which stays accurate when M is tiny.
  const age = 141.50225 + (Math.log(0.00553) + Math.log(risk)) / 0.090165;
  return { phenoAge: age, difference: age - x.age, mortality: -Math.expm1(-risk) };
}

/**
 * Years each marker adds or removes compared with a typical healthy adult.
 * PhenoAge is linear in the predictor, so these add up exactly.
 */
export function contributions(x: PhenoInputs): Record<MarkerId, number> {
  const out = {} as Record<MarkerId, number>;
  for (const id of MARKER_IDS) {
    out[id] = (markerTerm(id, x[id]) - markerTerm(id, MARKERS[id].typical)) / 0.090165;
  }
  return out;
}
