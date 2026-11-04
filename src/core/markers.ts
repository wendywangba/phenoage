// The nine blood markers PhenoAge needs, how reports name them, and their units.

export type MarkerId =
  | "albumin"
  | "creatinine"
  | "glucose"
  | "crp"
  | "lymph"
  | "mcv"
  | "rdw"
  | "alp"
  | "wbc";

export const MARKER_IDS: MarkerId[] = [
  "albumin",
  "creatinine",
  "glucose",
  "crp",
  "lymph",
  "mcv",
  "rdw",
  "alp",
  "wbc",
];

export interface UnitDef {
  id: string;
  label: string;
  /** Multiply a value in this unit by `factor` to get the marker's base unit. */
  factor: number;
  /** Values outside this range are almost certainly not in this unit. */
  plausible: [number, number];
}

export interface MarkerDef {
  id: MarkerId;
  /** Units the page accepts; the first one is the base unit used in calculations. */
  units: UnitDef[];
  /** Chinese and English report names, normalized with `normName`. */
  names: string[];
  /** Abbreviations, normalized with `normName`. */
  codes: string[];
  /** Names that need the unit or value to tell which measurement it is. */
  ambiguous?: string[];
  /** Typical healthy adult value, only used to explain which markers push the result up or down. */
  typical: number;
}

export const MARKERS: Record<MarkerId, MarkerDef> = {
  albumin: {
    id: "albumin",
    units: [
      { id: "g/L", label: "g/L", factor: 1, plausible: [15, 65] },
      { id: "g/dL", label: "g/dL", factor: 10, plausible: [1.5, 6.5] },
    ],
    names: ["白蛋白", "血清白蛋白", "清蛋白", "ALBUMIN", "白蛋白测定"],
    codes: ["ALB", "ALBUMIN"],
    typical: 45,
  },
  creatinine: {
    id: "creatinine",
    units: [
      { id: "umol/L", label: "µmol/L", factor: 1, plausible: [15, 1500] },
      { id: "mg/dL", label: "mg/dL", factor: 88.42, plausible: [0.15, 17] },
    ],
    names: ["肌酐", "血肌酐", "血清肌酐", "肌酐测定", "CREATININE", "CREATININESERUM"],
    codes: ["CREA", "CRE", "CR", "SCR", "CREAT"],
    typical: 70,
  },
  glucose: {
    id: "glucose",
    units: [
      { id: "mmol/L", label: "mmol/L", factor: 1, plausible: [1.5, 35] },
      { id: "mg/dL", label: "mg/dL", factor: 1 / 18.016, plausible: [27, 630] },
    ],
    names: [
      "葡萄糖",
      "血糖",
      "空腹血糖",
      "空腹葡萄糖",
      "血清葡萄糖",
      "空腹血葡萄糖",
      "葡萄糖测定",
      "GLUCOSE",
      "GLUCOSEFASTING",
      "FASTINGGLUCOSE",
    ],
    codes: ["GLU", "GLUC", "FPG", "FBG"],
    typical: 5.0,
  },
  crp: {
    id: "crp",
    units: [
      { id: "mg/L", label: "mg/L", factor: 1, plausible: [0.01, 500] },
      { id: "mg/dL", label: "mg/dL", factor: 10, plausible: [0.001, 50] },
    ],
    names: [
      "C反应蛋白",
      "超敏C反应蛋白",
      "高敏C反应蛋白",
      "全程C反应蛋白",
      "快速C反应蛋白",
      "超敏CRP",
      "CREACTIVEPROTEIN",
      "CREACTIVEPROTEINCARDIAC",
      "HSCREACTIVEPROTEIN",
      "HIGHSENSITIVITYCREACTIVEPROTEIN",
    ],
    codes: ["CRP", "HSCRP", "HCRP", "CRPHS"],
    typical: 1.0,
  },
  lymph: {
    id: "lymph",
    units: [{ id: "%", label: "%", factor: 1, plausible: [1, 95] }],
    names: [
      "淋巴细胞百分比",
      "淋巴细胞百分率",
      "淋巴细胞百分数",
      "淋巴细胞比率",
      "淋巴细胞比例",
      "淋巴细胞比值",
      "淋巴细胞%",
      "LYMPHOCYTES%",
      "LYMPHOCYTE%",
      "LYMPHS%",
      "LYMPHOCYTEPERCENT",
    ],
    codes: ["LYM%", "LY%", "LYMPH%", "LYMP%"],
    ambiguous: ["淋巴细胞", "LYMPHOCYTES", "LYMPHS", "LYM", "LYMPH"],
    typical: 30,
  },
  mcv: {
    id: "mcv",
    units: [{ id: "fL", label: "fL", factor: 1, plausible: [50, 150] }],
    names: ["平均红细胞体积", "红细胞平均体积", "MEANCORPUSCULARVOLUME", "MEANCELLVOLUME"],
    codes: ["MCV"],
    typical: 90,
  },
  rdw: {
    id: "rdw",
    units: [{ id: "%", label: "%", factor: 1, plausible: [8, 30] }],
    names: [
      "红细胞分布宽度",
      "红细胞体积分布宽度",
      "红细胞分布宽度CV",
      "红细胞体积分布宽度CV",
      "红细胞分布宽度变异系数",
      "红细胞体积分布宽度变异系数",
      "REDCELLDISTRIBUTIONWIDTH",
      "REDBLOODCELLDISTRIBUTIONWIDTH",
    ],
    codes: ["RDW", "RDWCV"],
    typical: 13.0,
  },
  alp: {
    id: "alp",
    units: [
      { id: "U/L", label: "U/L", factor: 1, plausible: [5, 2000] },
      { id: "ukat/L", label: "µkat/L", factor: 60, plausible: [0.08, 33] },
    ],
    names: ["碱性磷酸酶", "碱性磷酸酶测定", "ALKALINEPHOSPHATASE"],
    codes: ["ALP", "AKP", "ALKP"],
    typical: 70,
  },
  wbc: {
    id: "wbc",
    units: [
      { id: "10^9/L", label: "10⁹/L", factor: 1, plausible: [0.5, 100] },
      { id: "/uL", label: "/µL", factor: 0.001, plausible: [500, 100000] },
    ],
    names: [
      "白细胞计数",
      "白细胞",
      "白细胞数",
      "白细胞总数",
      "白细胞数目",
      "WHITEBLOODCELLCOUNT",
      "WHITEBLOODCELLS",
      "WBCCOUNT",
    ],
    codes: ["WBC"],
    typical: 6.0,
  },
};

/** Names that mean RDW-SD (in fL), which PhenoAge does not use. */
export const RDW_SD_NAMES = ["红细胞分布宽度SD", "红细胞体积分布宽度SD", "红细胞分布宽度标准差", "RDWSD"];

/** Normalize a report label for matching: half-width, uppercase, no spaces or decorations. */
export function normName(raw: string): string {
  return toHalfWidth(raw)
    .toUpperCase()
    .replace(/Γ|Y-(?=谷)/g, "") // γ-谷氨酰… is often read as Y-
    .replace(/^[\s△▲*★☆#●◆■□·•※]+/, "")
    .replace(/^\d{1,2}[.、)]\s*(?=\D)/, "") // row numbers such as "12." or "3、"
    .replace(/[\s△▲*★☆●◆■□·•※:_,\-–—]/g, "");
}

export function toHalfWidth(s: string): string {
  return s
    .replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/　/g, " ")
    .replace(/[。]/g, ".");
}

/** Normalize a unit string as OCR reads it (10~9/L, μmol/L, fl …). */
export function normUnit(raw: string): string {
  return toHalfWidth(raw)
    .toLowerCase()
    .replace(/\s/g, "")
    .replace(/[μµ]/g, "u")
    .replace(/[⁹]/g, "9")
    .replace(/[³]/g, "3")
    .replace(/^[×x*]?10[\^~*e]?([0-9]{1,2})(?=\/)/, "10^$1");
}

const UNIT_PATTERNS: { re: RegExp; id: string }[] = [
  { re: /^g\/dl$/, id: "g/dL" },
  { re: /^g\/l$/, id: "g/L" },
  { re: /^umol\/l$/, id: "umol/L" },
  { re: /^mmol\/l$/, id: "mmol/L" },
  { re: /^mg\/dl$/, id: "mg/dL" },
  { re: /^mg\/l$/, id: "mg/L" },
  { re: /^%$/, id: "%" },
  { re: /^fl$/, id: "fL" },
  { re: /^i?u\/l$/, id: "U/L" },
  { re: /^ukat\/l$/, id: "ukat/L" },
  { re: /^10\^9\/l$/, id: "10^9/L" },
  { re: /^(10\^3\/ul|k\/ul|thou\/ul)$/, id: "10^9/L" },
  { re: /^(\/ul|cells\/ul|个\/ul)$/, id: "/uL" },
];

/** Map a unit string from a report to one of our unit ids, if we know it. */
export function unitId(raw: string): string | undefined {
  const u = normUnit(raw);
  return UNIT_PATTERNS.find((p) => p.re.test(u))?.id;
}

export function looksLikeUnit(raw: string): boolean {
  const u = normUnit(raw);
  if (unitId(raw) !== undefined) return true;
  if (/\d\s*(-{1,2}|~|～|—|–)\s*\d/.test(u)) return false; // a reference range
  return /^[a-z%^0-9]*\/[a-z0-9.^/]+$|^(pg|fl|%|‰)$/.test(u);
}
