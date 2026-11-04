# PhenoAge 表型年龄计算

上传体检报告截图，在浏览器里识别 9 项常规血液指标，估算表型年龄（PhenoAge）。

**在线使用：<https://wendywangba.github.io/phenoage/>**

[English below](#english)

- **不上传**：文字识别（PaddleOCR）和计算都在浏览器里完成，截图不会离开你的设备。
- **认得中国报告**：支持“白细胞计数 / WBC”“肌酐（CREA）”“△*碱性磷酸酶”这类写法、名称换行、不同的列顺序，也认得美国报告的英文写法。
- **单位正确**：g/L 和 g/dL、µmol/L 和 mg/dL、mmol/L 和 mg/dL 都能用。识别到的单位和数值对不上时会提醒。
- **能核对**：识别结果先填进表格，确认或修改之后再计算。不想传截图也可以直接手填。
- **能分享**：生成一张结果图，长按保存。

## 需要的 9 项指标

| 指标 | 常见写法 | 计算用单位 |
|---|---|---|
| 白蛋白 | ALB | g/L |
| 肌酐 | CREA、Cr | µmol/L |
| 空腹血糖 | GLU | mmol/L |
| C 反应蛋白 | CRP、hs-CRP | mg/L（公式内取 ln(mg/dL)） |
| 淋巴细胞百分比 | LYM% | % |
| 平均红细胞体积 | MCV | fL |
| 红细胞分布宽度 | RDW-CV | % |
| 碱性磷酸酶 | ALP | U/L |
| 白细胞计数 | WBC | 10⁹/L |

很多常规体检不含 C 反应蛋白，没有这一项就算不出 PhenoAge。

## 公式

Levine ME et al. *An epigenetic biomarker of aging for lifespan and healthspan.* Aging 2018;10:573–591.
Liu Z et al. *A new aging measure captures morbidity and mortality risk across diverse subpopulations from NHANES IV.* PLoS Med 2018;15:e1002718.

```
xb = −19.9067 − 0.0336·白蛋白 + 0.0095·肌酐 + 0.1953·血糖 + 0.0954·ln(CRP, mg/dL)
     − 0.0120·淋巴% + 0.0268·MCV + 0.3306·RDW + 0.00188·ALP + 0.0554·WBC + 0.0804·年龄
M  = 1 − exp(−exp(xb) · (exp(120·0.0076927) − 1) / 0.0076927)
PhenoAge = 141.50225 + ln(−0.00553 · ln(1 − M)) / 0.090165
```

实现见 [`src/core/phenoage.ts`](src/core/phenoage.ts)，测试见 [`tests/`](tests/)。

## 开发

```bash
npm install
npm run dev      # 本地预览
npm test         # 公式、单位、报告解析的测试
npm run build    # 输出到 dist/
```

`npm run ocr:samples -- <文件夹>` 可以在 Node 里对一批截图跑识别，方便调试。真实体检报告含个人信息，请放在仓库外面（`samples/` 已被忽略）。

## 用到的开源项目

- [PaddleOCR](https://github.com/PaddlePaddle/PaddleOCR) 的 PP-OCRv4 中文模型（Apache-2.0），通过 [@gutenye/ocr-models](https://www.npmjs.com/package/@gutenye/ocr-models) 获取
- [ONNX Runtime Web](https://onnxruntime.ai/)（MIT）
- [Vite](https://vite.dev/)

## 免责声明

仅供兴趣参考，不构成医疗建议。PhenoAge 是研究用的统计模型，基于美国 NHANES 人群数据。

---

## English

Upload screenshots of a blood test report. The page reads the 9 markers with in-browser OCR, lets you check them, and computes PhenoAge (Levine 2018). Nothing is uploaded. It handles Chinese and US report formats and units (g/L vs g/dL, µmol/L vs mg/dL, mmol/L vs mg/dL).

Live: <https://wendywangba.github.io/phenoage/>. For curiosity only, not medical advice.
