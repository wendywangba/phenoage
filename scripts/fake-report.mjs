// Generate made-up checkup reports (about 20 pages) for testing PDF import.
// All names and numbers are invented. Needs Playwright with Chromium and a CJK font.
// Usage: node scripts/fake-report.mjs <out-dir>
//
// Writes:
//   report-text.pdf   text PDF, all 9 markers
//   report-nocrp.pdf  text PDF without the CRP test
//   report-scan.pdf   the same report as page images only (like a scan)
//   expected.json     the values the app should find

import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const out = process.argv[2] ?? "fake-reports";
mkdirSync(out, { recursive: true });

const expected = {
  age: 45,
  albumin: 44.2,
  creatinine: 68,
  glucose: 5.12,
  crp: 1.36,
  lymph: 33.6,
  mcv: 89.7,
  rdw: 12.6,
  alp: 72,
  wbc: 5.84,
};

const css = `
@page { size: A4; margin: 0; }
* { box-sizing: border-box; }
body { margin: 0; font-family: "WenQuanYi Zen Hei", "Noto Sans CJK SC", sans-serif; color: #222; }
.page { width: 210mm; height: 297mm; padding: 16mm 15mm; page-break-after: always; position: relative; }
.page:last-child { page-break-after: auto; }
.head { display: flex; justify-content: space-between; font-size: 10pt; color: #2a6; border-bottom: 1.5px solid #2a6; padding-bottom: 4px; margin-bottom: 12px; }
.foot { position: absolute; bottom: 10mm; left: 15mm; right: 15mm; font-size: 9pt; color: #888; text-align: center; }
h1 { font-size: 26pt; text-align: center; margin: 70mm 0 20mm; letter-spacing: 6px; }
h2 { font-size: 14pt; margin: 14px 0 8px; background: #eef6f2; padding: 4px 8px; }
table { width: 100%; border-collapse: collapse; font-size: 10.5pt; }
th { text-align: left; font-weight: normal; color: #555; border-bottom: 1px solid #ccc; padding: 5px 6px; }
td { padding: 5px 6px; border-bottom: 1px solid #eee; }
.info td { border: 0; font-size: 12pt; padding: 6px 0; }
p { font-size: 11pt; line-height: 1.8; margin: 4px 0; }
`;

let pageNo = 0;
const pages = [];
function page(body) {
  pageNo++;
  pages.push(`<div class="page"><div class="head"><span>示例体检中心 · 健康体检报告</span><span>体检编号 TJ2026000000</span></div>${body}<div class="foot">第 ${pageNo} 页</div></div>`);
}
function table(cols, rows) {
  return `<table><tr>${cols.map((c) => `<th>${c}</th>`).join("")}</tr>${rows
    .map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`)
    .join("")}</table>`;
}
const prose = (n) =>
  Array.from({ length: n }, (_, i) =>
    `<p>${i + 1}. 检查所见：形态大小正常，包膜光滑，实质回声均匀，未见明显异常。建议定期复查，保持良好生活习惯，注意饮食均衡，适量运动。</p>`,
  ).join("");

function build({ withCrp }) {
  pageNo = 0;
  pages.length = 0;
  // 1 cover
  page(`<h1>健康体检报告</h1>${table([], [])}<table class="info">
    <tr><td>姓名：测试用户</td><td>性别：女</td></tr>
    <tr><td>年龄：${expected.age}岁</td><td>体检日期：2026-09-18</td></tr>
    <tr><td>单位：示例公司</td><td>套餐：入职体检 B</td></tr></table>`);
  // 2 summary with prose that mentions marker names
  page(`<h2>总检结论</h2>
    <p>1. 尿白细胞阳性：建议复查尿常规。</p>
    <p>2. 白细胞计数、血糖、肌酐、白蛋白等结果见检验报告，未见明显异常。</p>
    <p>3. 甲状腺结节（TI-RADS 3类）：建议 6–12 个月复查甲状腺彩超。</p>
    <h2>健康建议</h2>${prose(8)}`);
  // 3–5 physical exam
  page(`<h2>一般检查</h2>${table(
    ["检查项目", "结果", "单位", "参考范围"],
    [
      ["身高", "162.0", "cm", ""],
      ["体重", "55.4", "kg", ""],
      ["体重指数", "21.1", "kg/m²", "18.5-23.9"],
      ["收缩压", "118", "mmHg", "90-139"],
      ["舒张压", "76", "mmHg", "60-89"],
      ["脉搏", "72", "次/分", "60-100"],
    ],
  )}<h2>内科</h2>${prose(5)}`);
  page(`<h2>外科</h2>${prose(6)}<h2>眼科</h2>${prose(5)}`);
  page(`<h2>耳鼻喉科</h2>${prose(5)}<h2>口腔科</h2>${prose(5)}`);
  // 6 urine first, so a naive reader would grab urine WBC / glucose
  page(`<h2>尿常规</h2>${table(
    ["项目名称", "结果", "单位", "参考范围"],
    [
      ["酸碱度", "6.0", "", "4.5-8.0"],
      ["比重", "1.020", "", "1.003-1.030"],
      ["白细胞", "15.3", "/μL", "0-12"],
      ["红细胞", "4.1", "/μL", "0-17"],
      ["葡萄糖", "阴性(-)", "", "阴性"],
      ["蛋白质", "阴性(-)", "", "阴性"],
      ["白细胞(镜检)", "0-2", "/HP", "0-5"],
    ],
  )}`);
  // 7–8 blood count, split across two pages; second page has no header row
  const cbcCols = ["项目名称", "本次结果", "上次结果", "提示", "单位", "参考范围"];
  page(`<h2>血常规（五分类）</h2>${table(cbcCols, [
    ["白细胞计数(WBC)", String(expected.wbc), "6.10", "", "10^9/L", "3.5-9.5"],
    ["中性粒细胞百分比(NEU%)", "55.2", "58.0", "", "%", "40-75"],
    ["淋巴细胞百分比(LYM%)", String(expected.lymph), "31.2", "", "%", "20-50"],
    ["单核细胞百分比(MON%)", "7.4", "6.9", "", "%", "3-10"],
    ["淋巴细胞绝对值(LYM#)", "1.96", "1.90", "", "10^9/L", "1.1-3.2"],
    ["红细胞计数(RBC)", "4.52", "4.48", "", "10^12/L", "3.8-5.1"],
    ["血红蛋白(HGB)", "135", "132", "", "g/L", "115-150"],
    ["红细胞压积(HCT)", "40.5", "40.1", "", "%", "35-45"],
  ])}`);
  page(table([], []) + `<table>${[
    ["平均红细胞体积(MCV)", String(expected.mcv), "90.1", "", "fL", "82-100"],
    ["平均红细胞血红蛋白量(MCH)", "29.9", "29.5", "", "pg", "27-34"],
    ["红细胞分布宽度-SD(RDW-SD)", "41.8", "42.3", "", "fL", "37-54"],
    ["红细胞分布宽度-CV(RDW-CV)", String(expected.rdw), "12.9", "", "%", "11-16"],
    ["血小板计数(PLT)", "236", "241", "", "10^9/L", "125-350"],
  ]
    .map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`)
    .join("")}</table>`);
  // 9–10 chemistry
  page(`<h2>肝功能</h2>${table(
    ["检验项目", "结果", "单位", "参考值"],
    [
      ["丙氨酸氨基转移酶(ALT)", "18", "U/L", "7-40"],
      ["天门冬氨酸氨基转移酶(AST)", "21", "U/L", "13-35"],
      ["总蛋白(TP)", "72.5", "g/L", "65-85"],
      ["白蛋白(ALB)", String(expected.albumin), "g/L", "40-55"],
      ["前白蛋白(PA)", "268", "mg/L", "200-400"],
      ["白/球比值(A/G)", "1.56", "", "1.2-2.4"],
      ["碱性磷酸酶(ALP)", String(expected.alp), "U/L", "35-100"],
      ["γ-谷氨酰转移酶(GGT)", "16", "U/L", "7-45"],
    ],
  )}<h2>肾功能</h2>${table(
    ["检验项目", "结果", "单位", "参考值"],
    [
      ["尿素(UREA)", "4.6", "mmol/L", "2.6-7.5"],
      ["肌酐(CREA)", String(expected.creatinine), "μmol/L", "41-73"],
      ["尿酸(UA)", "286", "μmol/L", "155-357"],
    ],
  )}`);
  page(`<h2>血糖</h2>${table(
    ["检验项目", "结果", "单位", "参考值"],
    [
      ["空腹血糖(GLU)", expected.glucose.toFixed(2), "mmol/L", "3.9-6.1"],
      ["糖化血红蛋白(HbA1c)", "5.4", "%", "4.0-6.0"],
    ],
  )}<h2>血脂</h2>${table(
    ["检验项目", "结果", "单位", "参考值"],
    [
      ["总胆固醇(TC)", "4.62", "mmol/L", "<5.2"],
      ["甘油三酯(TG)", "1.03", "mmol/L", "<1.7"],
      ["高密度脂蛋白胆固醇(HDL-C)", "1.48", "mmol/L", ">1.0"],
      ["低密度脂蛋白胆固醇(LDL-C)", "2.71", "mmol/L", "<3.4"],
    ],
  )}${
    withCrp
      ? `<h2>炎症指标</h2>${table(
          ["检验项目", "结果", "单位", "参考值"],
          [["超敏C反应蛋白(hs-CRP)", String(expected.crp), "mg/L", "0-3"]],
        )}`
      : ""
  }`);
  // 11–20 imaging and advice, mostly prose
  for (const t of ["心电图", "胸部 DR", "腹部彩超", "甲状腺彩超", "乳腺彩超", "妇科检查", "骨密度", "颈动脉彩超", "体检须知", "健康建议"]) {
    page(`<h2>${t}</h2>${prose(9)}`);
  }
  return `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${pages.join("")}</body></html>`;
}

const browser = await chromium.launch();
const ctx = await browser.newContext();
const pg = await ctx.newPage();

await pg.setContent(build({ withCrp: true }), { waitUntil: "load" });
await pg.pdf({ path: join(out, "report-text.pdf"), format: "A4", printBackground: true });
const count = pages.length;

// scanned copy: screenshot every page, then make a PDF of the images only
await pg.setViewportSize({ width: 794, height: 1123 });
const shots = [];
for (let i = 0; i < count; i++) {
  const el = (await pg.$$(".page"))[i];
  shots.push((await el.screenshot({ type: "jpeg", quality: 80, scale: "device" })).toString("base64"));
}
const scanHtml = `<!doctype html><html><head><style>@page{size:A4;margin:0}body{margin:0}img{width:210mm;height:297mm;display:block;page-break-after:always}</style></head><body>${shots
  .map((s) => `<img src="data:image/jpeg;base64,${s}">`)
  .join("")}</body></html>`;
const pg2 = await (await browser.newContext({ deviceScaleFactor: 1 })).newPage();
await pg2.setContent(scanHtml, { waitUntil: "load" });
await pg2.pdf({ path: join(out, "report-scan.pdf"), format: "A4" });

await pg.setContent(build({ withCrp: false }), { waitUntil: "load" });
await pg.pdf({ path: join(out, "report-nocrp.pdf"), format: "A4", printBackground: true });

writeFileSync(join(out, "expected.json"), JSON.stringify(expected, null, 2) + "\n");
await browser.close();
console.log(`wrote ${count}-page reports to ${out}`);
