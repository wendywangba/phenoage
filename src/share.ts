// Draws the share image (1080×1350, a good size for phone feeds).

export interface CardData {
  title: string;
  phenoAge: number;
  ageLine: string;
  diffLine: string;
  younger: boolean;
  highlights: { label: string; years: number }[];
  footer: string;
  url: string;
  yearsWord: string;
}

const W = 1080;
const H = 1350;
const FONT = `-apple-system, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", "Noto Sans SC", sans-serif`;

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

export function drawCard(d: CardData): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;

  const bg = g.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#eef6f3");
  bg.addColorStop(1, "#dcebf2");
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);

  // soft rings in the corner
  g.strokeStyle = "rgba(31, 122, 106, 0.10)";
  for (let r = 160; r <= 520; r += 90) {
    g.lineWidth = 28;
    g.beginPath();
    g.arc(W - 40, 80, r, 0, Math.PI * 2);
    g.stroke();
  }

  g.fillStyle = "#16423a";
  g.font = `600 52px ${FONT}`;
  g.textBaseline = "alphabetic";
  g.fillText(d.title, 90, 190);

  g.font = `700 300px ${FONT}`;
  g.fillStyle = "#1f7a6a";
  const num = d.phenoAge.toFixed(1);
  g.fillText(num, 80, 520);
  const numW = g.measureText(num).width;
  g.font = `500 56px ${FONT}`;
  g.fillStyle = "#16423a";
  g.fillText(d.yearsWord, 100 + numW, 520);

  g.font = `500 44px ${FONT}`;
  g.fillStyle = "#3d5a54";
  g.fillText(d.ageLine, 92, 610);

  // the difference as a pill
  let size = 46;
  g.font = `600 ${size}px ${FONT}`;
  while (g.measureText(d.diffLine).width > W - 260 && size > 28) {
    size -= 2;
    g.font = `600 ${size}px ${FONT}`;
  }
  const pillW = g.measureText(d.diffLine).width + 80;
  roundRect(g, 90, 650, pillW, 92, 46);
  g.fillStyle = d.younger ? "#1f7a6a" : "#b5532f";
  g.fill();
  g.fillStyle = "#fff";
  g.fillText(d.diffLine, 130, 696 + size * 0.35);

  // highlights
  let y = 860;
  g.font = `500 40px ${FONT}`;
  const max = Math.max(1, ...d.highlights.map((h) => Math.abs(h.years)));
  for (const h of d.highlights) {
    g.fillStyle = "#3d5a54";
    g.fillText(h.label, 92, y);
    const barX = 560;
    const barMax = 330;
    const len = Math.max(6, (Math.abs(h.years) / max) * barMax);
    roundRect(g, barX, y - 30, len, 34, 17);
    g.fillStyle = h.years < 0 ? "#1f7a6a" : "#b5532f";
    g.fill();
    g.fillStyle = "#3d5a54";
    g.font = `600 36px ${FONT}`;
    const sign = h.years > 0 ? "+" : "−";
    g.fillText(`${sign}${Math.abs(h.years).toFixed(1)}`, barX + len + 18, y);
    g.font = `500 40px ${FONT}`;
    y += 92;
  }

  g.fillStyle = "#5d7771";
  g.font = `400 32px ${FONT}`;
  g.fillText(d.footer, 92, H - 130);
  g.fillStyle = "#1f7a6a";
  g.font = `600 34px ${FONT}`;
  g.fillText(d.url, 92, H - 80);
  return c;
}
