import { MARKERS, type MarkerId, type UnitDef } from "./markers.ts";

export interface UnitChoice {
  unit: UnitDef;
  /** How we picked the unit. */
  how: "report" | "guessed" | "default";
  /** The value is outside the plausible range for every unit we know. */
  implausible: boolean;
  /** The report said one unit, but the value only makes sense in another. */
  conflict?: boolean;
}

function inRange(v: number, u: UnitDef): boolean {
  return v >= u.plausible[0] && v <= u.plausible[1];
}

/** Decide which unit a value is in, using the report's unit when we can read it. */
export function chooseUnit(id: MarkerId, value: number, reportUnit?: string): UnitChoice {
  const units = MARKERS[id].units;
  const stated = reportUnit ? units.find((u) => u.id === reportUnit) : undefined;
  if (stated) {
    if (inRange(value, stated)) return { unit: stated, how: "report", implausible: false };
    const other = units.find((u) => u !== stated && inRange(value, u));
    if (other) return { unit: other, how: "guessed", implausible: false, conflict: true };
    return { unit: stated, how: "report", implausible: true };
  }
  const fits = units.filter((u) => inRange(value, u));
  if (fits.length === 1) {
    return { unit: fits[0], how: fits[0] === units[0] ? "default" : "guessed", implausible: false };
  }
  if (fits.length > 1) return { unit: fits[0], how: "default", implausible: false };
  return { unit: units[0], how: "default", implausible: true };
}

export function toBase(id: MarkerId, value: number, unitId: string): number {
  const u = MARKERS[id].units.find((x) => x.id === unitId) ?? MARKERS[id].units[0];
  return value * u.factor;
}

export function isPlausible(id: MarkerId, value: number, unitId: string): boolean {
  const u = MARKERS[id].units.find((x) => x.id === unitId) ?? MARKERS[id].units[0];
  return Number.isFinite(value) && inRange(value, u);
}
