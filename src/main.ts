import "./style.css";
import { MARKER_IDS, MARKERS, toHalfWidth, type MarkerId } from "./core/markers.ts";
import { combine, findAge, parseReport, type Finding, type NoteKind, type ParseResult } from "./core/parse.ts";
import { chooseUnit, isPlausible, toBase } from "./core/units.ts";
import { contributions, phenoAge, type PhenoInputs, type PhenoResult } from "./core/phenoage.ts";
import { initOcr, recognizeFile } from "./ocr/client.ts";
import { ABBR, fmt, initialLang, saveLang, strings, type Lang } from "./i18n.ts";
import { drawCard } from "./share.ts";

// ------------------------------------------------------------------ state

interface Field {
  value: string;
  unit: string;
  /** What OCR filled in; flags only apply while the field still holds it. */
  ocr?: { value: string; unit: string; finding: Finding; guessed: boolean; conflict: boolean; derived: boolean };
  alternatives: Finding[];
  edited: boolean;
}

interface Img {
  id: number;
  file: File;
  url: string;
  status: "waiting" | "reading" | "done" | "failed";
  pct: number;
  result?: ParseResult;
  age?: number;
}

function emptyField(id: MarkerId): Field {
  return { value: "", unit: MARKERS[id].units[0].id, alternatives: [], edited: false };
}

const SITE_URL = "https://github.com/wendywangba/phenoage";

const state = {
  lang: initialLang() as Lang,
  images: [] as Img[],
  fields: Object.fromEntries(MARKER_IDS.map((id) => [id, emptyField(id)])) as unknown as Record<MarkerId, Field>,
  age: "",
  ageEdited: false,
  notes: [] as NoteKind[],
  download: null as null | { loaded: number; total: number },
  downloadFailed: false,
  showResult: false,
};
let nextImg = 1;
let busy = false;

const S = () => strings(state.lang);

// ------------------------------------------------------------------- dom

type Child = Node | string | number | null | undefined | false | Child[];

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Record<string, unknown> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v as EventListener);
    else if (k === "class") el.className = String(v);
    else if (k === "value") (el as HTMLInputElement).value = String(v);
    else if (k === "html") el.innerHTML = String(v);
    else el.setAttribute(k, v === true ? "" : String(v));
  }
  const add = (c: Child) => {
    if (c === null || c === undefined || c === false) return;
    if (Array.isArray(c)) c.forEach(add);
    else el.append(c instanceof Node ? c : String(c));
  };
  children.forEach(add);
  return el;
}

function replace(id: string, ...children: Child[]) {
  const el = document.getElementById(id);
  if (!el) return;
  const active = document.activeElement as HTMLInputElement | null;
  const focusId = active && el.contains(active) ? active.id : null;
  const sel = focusId && "selectionStart" in active! ? [active!.selectionStart, active!.selectionEnd] : null;
  el.replaceChildren(...h("div", {}, ...children).childNodes);
  if (focusId) {
    const again = document.getElementById(focusId) as HTMLInputElement | null;
    again?.focus();
    if (again && sel && sel[0] !== null) {
      try {
        again.setSelectionRange(sel[0], sel[1]);
      } catch {
        /* not a text input */
      }
    }
  }
}

// --------------------------------------------------------------- helpers

function parseNumber(s: string): { value: number; qualifier?: "<" | ">" } | null {
  const t = toHalfWidth(s).trim().replace(/,/g, ".").replace(/\s/g, "");
  const m = /^([<>≤≥])?(\d*\.?\d+)$/.exec(t);
  if (!m) return null;
  const q = m[1] ? (/[<≤]/.test(m[1]) ? "<" : ">") : undefined;
  return { value: parseFloat(m[2]), qualifier: q };
}

function fmtNum(v: number, digits = 1): string {
  return v.toFixed(digits);
}

function cleanNumber(v: number): string {
  return String(Math.round(v * 1000) / 1000);
}

// ------------------------------------------------------- OCR → fields

function applyFindings() {
  const results = state.images.filter((i) => i.status === "done" && i.result).map((i) => i.result!);
  const c = combine(results);
  state.notes = c.notes;
  for (const id of MARKER_IDS) {
    const f = state.fields[id];
    f.alternatives = c.alternatives[id] ?? [];
    if (f.edited) continue;
    const found = c.values[id];
    if (!found) {
      if (f.ocr) {
        f.value = "";
        f.unit = MARKERS[id].units[0].id;
      }
      f.ocr = undefined;
      continue;
    }
    fillFrom(id, found);
  }
  if (!state.ageEdited) {
    const age = state.images.find((i) => i.age)?.age;
    if (age) {
      state.age = String(age);
    }
  }
}

function fillFrom(id: MarkerId, found: Finding) {
  const f = state.fields[id];
  const choice = chooseUnit(id, found.value, found.unit);
  const value = (found.qualifier ?? "") + cleanNumber(found.value);
  f.value = value;
  f.unit = choice.unit.id;
  f.ocr = {
    value,
    unit: choice.unit.id,
    finding: found,
    guessed: choice.how === "guessed" || (!found.unit && MARKERS[id].units.length > 1),
    conflict: !!choice.conflict,
    derived: found.image === undefined,
  };
}

async function addFiles(files: FileList | File[]) {
  const list = [...files].filter((f) => f.type.startsWith("image/") || /\.(png|jpe?g|webp|heic|bmp)$/i.test(f.name));
  if (!list.length) return;
  for (const file of list) {
    state.images.push({ id: nextImg++, file, url: URL.createObjectURL(file), status: "waiting", pct: 0 });
  }
  renderUpload();
  await processQueue();
}

async function processQueue() {
  if (busy) return;
  busy = true;
  try {
    state.downloadFailed = false;
    await initOcr({
      onDownload: (loaded, total) => {
        state.download = loaded < total ? { loaded, total } : null;
        renderUpload();
      },
    });
    state.download = null;
    for (;;) {
      const img = state.images.find((i) => i.status === "waiting");
      if (!img) break;
      img.status = "reading";
      renderUpload();
      try {
        const boxes = await recognizeFile(img.file, (done, total) => {
          img.pct = Math.round((done / total) * 100);
          renderUpload();
        });
        const index = state.images.indexOf(img);
        img.result = parseReport(boxes, index);
        img.age = findAge(boxes);
        img.status = "done";
      } catch (err) {
        console.error(err);
        img.status = "failed";
      }
      applyFindings();
      renderUpload();
      renderForm();
    }
  } catch (err) {
    console.error(err);
    state.download = null;
    state.downloadFailed = true;
    renderUpload();
  } finally {
    busy = false;
  }
}

function removeImage(img: Img) {
  state.images = state.images.filter((i) => i !== img);
  URL.revokeObjectURL(img.url);
  // image indexes shift, so re-number the findings
  state.images.forEach((im, k) => im.result?.findings.forEach((f) => (f.image = k)));
  applyFindings();
  renderUpload();
  renderForm();
}

// ------------------------------------------------------------ assessing

type Level = "empty" | "ok" | "warn" | "error";

function assess(id: MarkerId): { level: Level; base?: number; messages: string[] } {
  const f = state.fields[id];
  const s = S();
  const messages: string[] = [];
  if (!f.value.trim()) return { level: "empty", messages };
  const n = parseNumber(f.value);
  if (!n || n.value <= 0) return { level: "error", messages: [s.implausible] };
  const fromOcr = f.ocr && f.ocr.value === f.value && f.ocr.unit === f.unit;
  let level: Level = "ok";
  if (fromOcr && f.ocr!.conflict) {
    messages.push(fmt(s.unitConflict, { unit: unitLabel(id, f.unit) }));
    level = "warn";
  } else if (fromOcr && f.ocr!.guessed) {
    messages.push(s.unitGuessed);
    level = "warn";
  }
  if (n.qualifier === "<") messages.push(fmt(s.below, { v: cleanNumber(n.value) }));
  if (n.qualifier === ">") messages.push(fmt(s.above, { v: cleanNumber(n.value) }));
  if (fromOcr && f.ocr!.derived && id === "lymph") messages.push(s.lymphDerived);
  if (!isPlausible(id, n.value, f.unit)) return { level: "error", messages: [s.implausible] };
  return { level, base: toBase(id, n.value, f.unit), messages };
}

function unitLabel(id: MarkerId, unit: string): string {
  return MARKERS[id].units.find((u) => u.id === unit)?.label ?? unit;
}

function ageValue(): number | null {
  const n = parseNumber(state.age);
  return n && !n.qualifier && n.value >= 18 && n.value <= 110 ? n.value : null;
}

function collect(): { inputs?: PhenoInputs; missing: MarkerId[]; bad: MarkerId[] } {
  const missing: MarkerId[] = [];
  const bad: MarkerId[] = [];
  const inputs = { age: ageValue() ?? NaN } as PhenoInputs;
  for (const id of MARKER_IDS) {
    const a = assess(id);
    if (a.level === "empty") missing.push(id);
    else if (a.level === "error" || a.base === undefined) bad.push(id);
    else inputs[id] = a.base;
  }
  if (missing.length || bad.length || !Number.isFinite(inputs.age)) return { missing, bad };
  return { inputs, missing, bad };
}

// -------------------------------------------------------------- render

function render() {
  const s = S();
  document.documentElement.lang = state.lang === "zh" ? "zh-CN" : "en";
  document.title = s.pageTitle;
  const app = document.getElementById("app")!;
  app.replaceChildren(
    h(
      "header",
      { class: "top" },
      h(
        "div",
        { class: "top-row" },
        h("h1", {}, s.title),
        h(
          "button",
          {
            class: "lang",
            type: "button",
            onclick: () => {
              state.lang = state.lang === "zh" ? "en" : "zh";
              saveLang(state.lang);
              render();
            },
          },
          s.langSwitch,
        ),
      ),
      h("p", { class: "tagline" }, s.tagline),
      h("p", { class: "privacy" }, h("span", { class: "lock", "aria-hidden": "true" }, "🔒"), s.privacy),
    ),
    h("section", { class: "card", id: "upload" }),
    h("section", { class: "card", id: "form" }),
    h("section", { class: "card result", id: "result", hidden: !state.showResult }),
    h(
      "footer",
      {},
      h("p", {}, s.footerFormula),
      h("p", {}, s.footerLocal),
      h("p", {}, h("a", { href: SITE_URL, target: "_blank", rel: "noopener" }, s.footerSource)),
    ),
  );
  renderUpload();
  renderForm();
  renderResult();
}

function renderUpload() {
  const s = S();
  const input = h("input", {
    type: "file",
    id: "file",
    accept: "image/*",
    multiple: true,
    class: "visually-hidden",
    onchange: (e: Event) => {
      const t = e.target as HTMLInputElement;
      if (t.files) void addFiles(t.files);
      t.value = "";
    },
  });
  const zone = h(
    "div",
    {
      class: "drop",
      ondragover: (e: DragEvent) => {
        e.preventDefault();
        zone.classList.add("over");
      },
      ondragleave: () => zone.classList.remove("over"),
      ondrop: (e: DragEvent) => {
        e.preventDefault();
        zone.classList.remove("over");
        if (e.dataTransfer?.files) void addFiles(e.dataTransfer.files);
      },
    },
    input,
    h("label", { for: "file", class: "btn primary" }, s.choose),
    h("span", { class: "drop-hint" }, s.dropHint),
  );

  const dl = state.download;
  replace(
    "upload",
    h("h2", {}, h("span", { class: "step" }, "1"), s.step1),
    h("p", { class: "hint" }, s.step1Hint),
    zone,
    dl &&
      h(
        "div",
        { class: "progress", role: "status" },
        h("div", { class: "bar" }, h("div", { class: "fill", style: `width:${(dl.loaded / dl.total) * 100}%` })),
        h(
          "p",
          {},
          fmt(s.downloading, { loaded: (dl.loaded / 1e6).toFixed(1), total: (dl.total / 1e6).toFixed(0) }),
        ),
      ),
    state.downloadFailed &&
      h(
        "div",
        { class: "alert" },
        h("p", {}, s.downloadFailed),
        h("button", { class: "btn", type: "button", onclick: () => void processQueue() }, s.retry),
      ),
    state.images.length > 0 &&
      h(
        "ul",
        { class: "thumbs" },
        state.images.map((img, k) => {
          const n = img.result?.findings.length ?? 0;
          const status =
            img.status === "waiting"
              ? s.waiting
              : img.status === "reading"
                ? fmt(s.recognizing, { pct: img.pct })
                : img.status === "failed"
                  ? s.failed
                  : n
                    ? fmt(s.foundN, { n })
                    : s.foundNone;
          return h(
            "li",
            { class: `thumb ${img.status} ${img.status === "done" && !n ? "none" : ""}` },
            h("img", { src: img.url, alt: fmt(s.fromImage, { i: k + 1 }) }),
            h("div", { class: "thumb-meta" }, h("strong", {}, fmt(s.fromImage, { i: k + 1 })), h("span", {}, status)),
            img.status !== "reading" &&
              h(
                "button",
                { class: "x", type: "button", "aria-label": s.removeImage, onclick: () => removeImage(img) },
                "×",
              ),
          );
        }),
      ),
    h("a", { class: "manual-link", href: "#form" }, s.manualLink),
  );
}

function renderForm() {
  const s = S();
  const rows = MARKER_IDS.map((id) => renderRow(id));
  replace(
    "form",
    h("h2", {}, h("span", { class: "step" }, "2"), s.step2),
    h("p", { class: "hint" }, s.step2Hint),
    h(
      "div",
      { class: "row age-row" },
      h("label", { for: "age", class: "name" }, h("span", {}, s.age)),
      h(
        "div",
        { class: "inputs" },
        h("input", {
          id: "age",
          inputmode: "decimal",
          autocomplete: "off",
          value: state.age,
          placeholder: "—",
          oninput: (e: Event) => {
            state.age = (e.target as HTMLInputElement).value;
            state.ageEdited = true;
            afterEdit();
          },
        }),
        h("span", { class: "unit-text" }, s.ageUnit),
      ),
    ),
    h("div", { class: "rows" }, rows),
    state.notes.includes("rdwSdOnly") && !state.fields.rdw.value && h("p", { class: "note" }, s.rdwSdOnly),
    h("div", { class: "calc" }, h("button", { class: "btn primary big", id: "calc", type: "button", onclick: calculate }, s.calculate), h("p", { id: "missing", class: "missing" })),
  );
  updateMissing();
}

function renderRow(id: MarkerId) {
  const s = S();
  const f = state.fields[id];
  const units = MARKERS[id].units;
  const unitEl =
    units.length > 1
      ? h(
          "select",
          {
            id: `unit-${id}`,
            "aria-label": `${s.markers[id]} unit`,
            onchange: (e: Event) => {
              f.unit = (e.target as HTMLSelectElement).value;
              afterEdit(id);
            },
          },
          units.map((u) => h("option", { value: u.id, selected: u.id === f.unit }, u.label)),
        )
      : h("span", { class: "unit-text" }, units[0].label);
  return h(
    "div",
    { class: "row", id: `row-${id}`, "data-level": assess(id).level },
    h(
      "label",
      { for: `in-${id}`, class: "name" },
      h("span", {}, s.markers[id]),
      h("small", {}, ABBR[id]),
    ),
    h(
      "div",
      { class: "inputs" },
      h("input", {
        id: `in-${id}`,
        inputmode: "decimal",
        autocomplete: "off",
        placeholder: "—",
        value: f.value,
        oninput: (e: Event) => {
          f.value = (e.target as HTMLInputElement).value;
          f.edited = true;
          afterEdit(id);
        },
      }),
      unitEl,
    ),
    h("div", { class: "status", id: `status-${id}` }, rowStatus(id)),
  );
}

function rowStatus(id: MarkerId): Child[] {
  const s = S();
  const f = state.fields[id];
  const a = assess(id);
  const out: Child[] = [];
  const fromOcr = f.ocr && f.ocr.value === f.value;
  if (fromOcr && f.ocr!.finding.image !== undefined) {
    const fd = f.ocr!.finding;
    out.push(
      h("span", { class: "chip" }, fmt(s.fromImage, { i: fd.image! + 1 })),
      h(
        "span",
        { class: "raw" },
        fmt(s.readAs, {
          raw: [fd.rawName.replace(/^[\s△▲*★☆#●◆※]+/, ""), fd.rawValue, fd.rawUnit].filter(Boolean).join("  "),
        }),
      ),
    );
  }
  for (const m of a.messages) out.push(h("span", { class: `msg ${a.level}` }, m));
  for (const alt of f.alternatives) {
    if (cleanNumber(alt.value) === f.value) continue;
    out.push(
      h(
        "span",
        { class: "msg" },
        fmt(s.alternative, { v: `${alt.qualifier ?? ""}${cleanNumber(alt.value)} ${alt.rawUnit ?? ""}`.trim() }),
        " ",
        h(
          "button",
          {
            class: "link",
            type: "button",
            onclick: () => {
              const prev = f.ocr?.finding;
              fillFrom(id, alt);
              f.edited = true;
              if (prev) f.alternatives = [...f.alternatives.filter((x) => x !== alt), prev];
              renderForm();
              afterEdit();
            },
          },
          s.useThis,
        ),
      ),
    );
  }
  if (id === "crp" && a.level === "empty") out.push(h("span", { class: "msg help" }, s.crpHelp));
  return out;
}

function afterEdit(id?: MarkerId) {
  if (id) {
    const row = document.getElementById(`row-${id}`);
    if (row) {
      const st = document.getElementById(`status-${id}`);
      row.setAttribute("data-level", assess(id).level);
      st?.replaceChildren(...h("div", {}, rowStatus(id)).childNodes);
    }
  }
  updateMissing();
  if (state.showResult) renderResult();
}

function updateMissing() {
  const s = S();
  const el = document.getElementById("missing");
  const btn = document.getElementById("calc") as HTMLButtonElement | null;
  if (!el || !btn) return;
  const c = collect();
  const names = [...(ageValue() ? [] : [s.age]), ...[...c.missing, ...c.bad].map((id) => s.markers[id])];
  el.textContent = names.length ? fmt(s.missingList, { list: names.join(state.lang === "zh" ? "、" : ", ") }) : "";
  btn.disabled = !c.inputs;
}

function calculate() {
  const c = collect();
  if (!c.inputs) return;
  state.showResult = true;
  renderResult();
  document.getElementById("result")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

let cardUrl: string | null = null;

function renderResult() {
  const el = document.getElementById("result");
  if (!el) return;
  const c = collect();
  if (!state.showResult || !c.inputs) {
    el.hidden = true;
    return;
  }
  el.hidden = false;
  const s = S();
  const r: PhenoResult = phenoAge(c.inputs);
  const contrib = contributions(c.inputs);
  const d = r.difference;
  const diffText =
    Math.abs(d) < 0.5 ? s.same : d < 0 ? fmt(s.younger, { d: fmtNum(-d) }) : fmt(s.older, { d: fmtNum(d) });
  const sorted = [...MARKER_IDS].sort((a, b) => Math.abs(contrib[b]) - Math.abs(contrib[a]));
  const max = Math.max(1, ...sorted.map((id) => Math.abs(contrib[id])));

  const canvas = drawCard({
    title: s.cardTitle,
    phenoAge: r.phenoAge,
    yearsWord: s.years,
    ageLine: fmt(s.chrono, { age: cleanNumber(c.inputs.age) }),
    diffLine:
      Math.abs(d) < 0.5 ? s.cardSame : d < 0 ? fmt(s.cardYounger, { d: fmtNum(-d) }) : fmt(s.cardOlder, { d: fmtNum(d) }),
    younger: d < 0,
    highlights: sorted.slice(0, 3).map((id) => ({ label: s.short[id], years: contrib[id] })),
    footer: s.cardFooter,
    url: location.host ? `${location.host}${import.meta.env.BASE_URL}`.replace(/\/$/, "") : "",
  });
  const dataUrl = canvas.toDataURL("image/png");
  if (cardUrl) URL.revokeObjectURL(cardUrl);
  cardUrl = null;

  const canShare = typeof navigator.canShare === "function";
  replace(
    "result",
    h("h2", {}, h("span", { class: "step" }, "3"), s.step3),
    h(
      "div",
      { class: "big" },
      h("p", { class: "label" }, s.yourPheno),
      h("p", { class: "num" }, fmtNum(r.phenoAge), h("small", {}, s.years)),
      h("p", { class: "chrono" }, fmt(s.chrono, { age: cleanNumber(c.inputs.age) })),
      h("p", { class: `diff ${d < 0 ? "good" : d > 0.5 ? "bad" : ""}` }, diffText),
    ),
    h("h3", {}, s.contribTitle),
    h("p", { class: "hint" }, s.contribHint),
    h(
      "ul",
      { class: "contrib" },
      sorted.map((id) => {
        const v = contrib[id];
        const w = (Math.abs(v) / max) * 50;
        return h(
          "li",
          {},
          h("span", { class: "c-name" }, s.short[id]),
          h(
            "span",
            { class: "c-bar" },
            h("span", {
              class: `c-fill ${v < 0 ? "neg" : "pos"}`,
              style: v < 0 ? `right:50%;width:${w}%` : `left:50%;width:${w}%`,
            }),
          ),
          h("span", { class: "c-val" }, `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(1)}`),
        );
      }),
    ),
    h("h3", {}, s.caveatTitle),
    h("ul", { class: "caveats" }, s.caveats.map((t) => h("li", {}, t))),
    h("h3", {}, s.shareTitle),
    h("img", { class: "card-img", src: dataUrl, alt: s.cardTitle, width: 1080, height: 1350 }),
    h(
      "div",
      { class: "share-actions" },
      h("span", { class: "hint" }, s.shareHint),
      h("a", { class: "btn", href: dataUrl, download: "phenoage.png" }, s.download),
      canShare &&
        h(
          "button",
          {
            class: "btn",
            type: "button",
            onclick: async () => {
              const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, "image/png"));
              if (!blob) return;
              const file = new File([blob], "phenoage.png", { type: "image/png" });
              if (navigator.canShare({ files: [file] })) {
                try {
                  await navigator.share({ files: [file], title: s.cardTitle });
                } catch {
                  /* cancelled */
                }
              }
            },
          },
          s.share,
        ),
    ),
    h("button", { class: "btn ghost", type: "button", onclick: startOver }, s.startOver),
  );
}

function startOver() {
  for (const img of state.images) URL.revokeObjectURL(img.url);
  state.images = [];
  for (const id of MARKER_IDS) {
    state.fields[id] = emptyField(id);
  }
  state.age = "";
  state.ageEdited = false;
  state.notes = [];
  state.showResult = false;
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// paste screenshots straight from the clipboard on desktop
window.addEventListener("paste", (e) => {
  const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith("image/"));
  if (files.length) void addFiles(files);
});

render();
