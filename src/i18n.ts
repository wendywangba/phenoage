import type { MarkerId } from "./core/markers.ts";

export type Lang = "zh" | "en";

const zh = {
  pageTitle: "PhenoAge 表型年龄计算",
  title: "表型年龄 PhenoAge",
  tagline: "上传体检报告截图，用 9 项常规血液指标估算你的表型年龄。",
  privacy: "截图只在你的设备上识别，不会上传到任何服务器。",
  langSwitch: "English",

  step1: "上传报告截图",
  step1Hint: "可以一次选多张：血常规、肝功能、肾功能、血糖、C 反应蛋白常在不同页上。截图比拍照识别更准。",
  choose: "选择截图",
  dropHint: "或把图片拖到这里",
  manualLink: "没有截图？直接填写 ↓",
  downloading: "首次使用要下载识别模型（{total} MB），已下载 {loaded} MB…",
  downloadFailed: "识别模型下载失败，请检查网络后重试，或直接手动填写。",
  retry: "重试",
  waiting: "等待识别",
  recognizing: "识别中 {pct}%",
  foundN: "找到 {n} 项",
  foundNone: "没找到需要的指标",
  failed: "识别失败",
  removeImage: "移除",

  step2: "核对数值",
  step2Hint: "识别可能出错，请对照报告检查一遍，单位不对可以直接改。",
  age: "体检时的年龄",
  ageUnit: "岁",
  fromImage: "图 {i}",
  manual: "手动填写",
  readAs: "识别到：{raw}",
  unitGuessed: "单位是按数值推测的，请确认",
  unitConflict: "报告上的单位和数值对不上，已改成 {unit}，请确认",
  implausible: "这个数值看起来不太对，请检查单位或数值",
  below: "报告写的是“<{v}”，按 {v} 计算，结果会略偏大",
  above: "报告写的是“>{v}”，按 {v} 计算",
  alternative: "另一张图里是 {v}",
  useThis: "用这个",
  lymphDerived: "报告只有淋巴细胞绝对值，已按 绝对值 ÷ 白细胞 × 100 换算成百分比",
  rdwSdOnly: "报告里只找到 RDW-SD（单位 fL）。PhenoAge 用的是 RDW-CV（单位 %），如果报告上有请手动填写。",
  crpHelp: "很多常规体检不含 C 反应蛋白（CRP）。没有这一项算不出 PhenoAge，下次体检可以加做“超敏 C 反应蛋白”。",
  calculate: "计算 PhenoAge",
  calculateEstimate: "估算 PhenoAge（缺 {n} 项）",
  canEstimate: "缺 1–2 项也能先估算。",
  tooMany: "缺 3 项及以上就估算不了了。",
  missingList: "还差：{list}。",

  step3: "结果",
  yourPheno: "你的表型年龄",
  estimatedPheno: "估算的表型年龄",
  approx: "约",
  rangeLine: "可能在 {lo}–{hi} 岁之间",
  estimateNote:
    "缺少 {list}，先按典型健康成年人的值代入。范围是假设缺的指标落在正常参考范围内算出的；如果它其实偏高或偏低（比如有炎症时 C 反应蛋白会升高），真实结果可能超出这个范围。",
  notProvided: "未提供",
  chrono: "实际年龄 {age} 岁",
  younger: "比实际年龄年轻 {d} 岁",
  older: "比实际年龄大 {d} 岁",
  same: "和实际年龄差不多",
  years: "岁",
  contribTitle: "哪些指标在拉高或拉低",
  contribHint: "和一位典型的健康成年人相比，每项指标让表型年龄增加（向右）或减少（向左）了多少岁。",
  caveatTitle: "怎么看这个结果",
  caveats: [
    "PhenoAge 是研究衰老用的统计模型（Levine 2018），基于美国 NHANES 人群数据，不是诊断。",
    "一次体检的波动（感冒、熬夜、没空腹）会明显影响结果，看几年的趋势比看一次更有意义。",
    "二十多岁的人算出来常比实际年龄小很多，这是模型本身的特点。",
    "红细胞分布宽度（RDW）很敏感：每差 1% 约差 3.7 岁，而不同医院仪器测出的结果有差别。",
    "有任何指标异常，请咨询医生。",
  ],
  shareTitle: "分享图",
  shareHint: "长按图片保存，或者：",
  download: "保存图片",
  share: "分享",
  startOver: "重新开始",
  cardTitle: "我的表型年龄",
  cardYounger: "年轻 {d} 岁",
  cardOlder: "大 {d} 岁",
  cardSame: "和实际年龄差不多",
  cardFooter: "基于 {n} 项血液指标 · PhenoAge (Levine 2018)",
  cardEstimate: "估算 · 缺 {list} · 范围 {lo}–{hi} 岁",

  footerFormula: "公式：Levine 等 (2018) Aging；Liu 等 (2018) PLoS Medicine。",
  footerLocal: "识别和计算都在你的浏览器里完成。仅供兴趣参考，不构成医疗建议。",

  markers: {
    albumin: "白蛋白",
    creatinine: "肌酐",
    glucose: "空腹血糖",
    crp: "C 反应蛋白",
    lymph: "淋巴细胞百分比",
    mcv: "平均红细胞体积",
    rdw: "红细胞分布宽度",
    alp: "碱性磷酸酶",
    wbc: "白细胞计数",
  } as Record<MarkerId, string>,
  short: {
    albumin: "白蛋白",
    creatinine: "肌酐",
    glucose: "血糖",
    crp: "C 反应蛋白",
    lymph: "淋巴细胞%",
    mcv: "红细胞体积",
    rdw: "RDW",
    alp: "碱性磷酸酶",
    wbc: "白细胞",
  } as Record<MarkerId, string>,
};

type Strings = typeof zh;

const en: Strings = {
  pageTitle: "PhenoAge Calculator",
  title: "PhenoAge",
  tagline: "Upload screenshots of a blood test report and estimate your phenotypic age from 9 routine markers.",
  privacy: "Images are read on your device. Nothing is uploaded.",
  langSwitch: "中文",

  step1: "Upload report screenshots",
  step1Hint:
    "You can pick several at once: the blood count, liver, kidney, glucose and CRP results are often on different pages. Screenshots read better than photos.",
  choose: "Choose screenshots",
  dropHint: "or drop images here",
  manualLink: "No screenshots? Type the values below ↓",
  downloading: "First use downloads the text recognition model ({total} MB): {loaded} MB so far…",
  downloadFailed: "Could not download the recognition model. Check your connection and retry, or type the values in.",
  retry: "Retry",
  waiting: "Waiting",
  recognizing: "Reading {pct}%",
  foundN: "{n} found",
  foundNone: "No markers found",
  failed: "Could not read",
  removeImage: "Remove",

  step2: "Check the values",
  step2Hint: "Recognition can make mistakes. Compare with your report and fix any value or unit.",
  age: "Age at the time of the test",
  ageUnit: "years",
  fromImage: "Image {i}",
  manual: "Typed in",
  readAs: "Read: {raw}",
  unitGuessed: "Unit guessed from the value, please check",
  unitConflict: "The unit on the report doesn't fit the value, switched to {unit}. Please check",
  implausible: "This value looks off. Please check the number and unit",
  below: "The report says “<{v}”. Using {v}, which makes the result slightly higher",
  above: "The report says “>{v}”. Using {v}",
  alternative: "Another image says {v}",
  useThis: "Use it",
  lymphDerived: "Only the absolute lymphocyte count was found; converted with count ÷ WBC × 100",
  rdwSdOnly: "Only RDW-SD (in fL) was found. PhenoAge uses RDW-CV (in %). Type it in if your report has it.",
  crpHelp:
    "Many routine checkups don't include C-reactive protein (CRP). PhenoAge can't be computed without it; ask for hs-CRP next time.",
  calculate: "Calculate PhenoAge",
  calculateEstimate: "Estimate PhenoAge ({n} missing)",
  canEstimate: "You can still get an estimate with 1–2 missing.",
  tooMany: "With 3 or more missing there's no estimate.",
  missingList: "Still needed: {list}.",

  step3: "Result",
  yourPheno: "Your PhenoAge",
  estimatedPheno: "Your estimated PhenoAge",
  approx: "≈",
  rangeLine: "Likely between {lo} and {hi}",
  estimateNote:
    "Missing: {list}. A typical healthy adult value was used instead. The range assumes the missing marker is somewhere in its normal range; if it is actually high or low (CRP rises with inflammation, for example), the true result can fall outside it.",
  notProvided: "not provided",
  chrono: "Calendar age {age}",
  younger: "{d} years younger than your calendar age",
  older: "{d} years older than your calendar age",
  same: "About the same as your calendar age",
  years: "yrs",
  contribTitle: "What pushes it up or down",
  contribHint:
    "Compared with a typical healthy adult, how many years each marker adds (right) or takes off (left).",
  caveatTitle: "How to read this",
  caveats: [
    "PhenoAge is a research model of aging (Levine 2018) built on US NHANES data. It is not a diagnosis.",
    "One test can swing a lot (a cold, poor sleep, not fasting). The trend over a few years tells you more.",
    "People in their twenties often get a result far below their age. That's how the model behaves.",
    "RDW is very sensitive: each 1% shifts the result by about 3.7 years, and analyzers differ between labs.",
    "If any value is outside its normal range, talk to a doctor.",
  ],
  shareTitle: "Share image",
  shareHint: "Long-press the image to save it, or:",
  download: "Save image",
  share: "Share",
  startOver: "Start over",
  cardTitle: "My PhenoAge",
  cardYounger: "{d} years younger",
  cardOlder: "{d} years older",
  cardSame: "About my calendar age",
  cardFooter: "From {n} blood markers · PhenoAge (Levine 2018)",
  cardEstimate: "Estimate · missing {list} · range {lo}–{hi}",

  footerFormula: "Formula: Levine et al. (2018) Aging; Liu et al. (2018) PLoS Medicine.",
  footerLocal: "Everything runs in your browser. For curiosity only, not medical advice.",

  markers: {
    albumin: "Albumin",
    creatinine: "Creatinine",
    glucose: "Fasting glucose",
    crp: "C-reactive protein",
    lymph: "Lymphocytes %",
    mcv: "Mean cell volume",
    rdw: "Red cell distribution width",
    alp: "Alkaline phosphatase",
    wbc: "White blood cells",
  },
  short: {
    albumin: "Albumin",
    creatinine: "Creatinine",
    glucose: "Glucose",
    crp: "CRP",
    lymph: "Lymphocytes %",
    mcv: "MCV",
    rdw: "RDW",
    alp: "ALP",
    wbc: "WBC",
  },
};

export const ABBR: Record<MarkerId, string> = {
  albumin: "ALB",
  creatinine: "CREA",
  glucose: "GLU",
  crp: "CRP",
  lymph: "LYM%",
  mcv: "MCV",
  rdw: "RDW-CV",
  alp: "ALP",
  wbc: "WBC",
};

const STRINGS: Record<Lang, Strings> = { zh, en };

export function initialLang(): Lang {
  try {
    const saved = localStorage.getItem("phenoage-lang");
    if (saved === "zh" || saved === "en") return saved;
  } catch {
    /* storage may be blocked */
  }
  return /^zh/i.test(navigator.language) ? "zh" : "en";
}

export function saveLang(l: Lang) {
  try {
    localStorage.setItem("phenoage-lang", l);
  } catch {
    /* ignore */
  }
}

export function strings(l: Lang): Strings {
  return STRINGS[l];
}

export function fmt(s: string, vars: Record<string, string | number>): string {
  return s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));
}
