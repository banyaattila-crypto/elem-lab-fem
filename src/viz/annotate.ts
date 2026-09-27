/**
 * Rajz-annotációk: méretvonalak (hossz, magasság, lyuk-Ø) és
 * infópanel (modell, anyag, keresztmetszet) a Canvas 2D nézeten.
 * Tiszta függvények + rajzoló — a méretezés a renderer lastView-jából jön.
 */

import type { Mesh, MeshAnnotation } from '../fem/types';

/** Egy méretvonal leírója képernyő-koordinátákban */
interface DimLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** A vonal felirata (előre formázva) */
  label: string;
}

/** Hossz formázása emberi módon (m/cm/mm) */
function fmtLen(m: number): string {
  const a = Math.abs(m);
  if (a >= 1) return `${m.toFixed(2)} m`;
  if (a >= 0.01) return `${(m * 100).toFixed(1)} cm`;
  return `${(m * 1000).toFixed(0)} mm`;
}

/**
 * Méretvonalak kiszámítása: a modell befoglalójából vízszintes (hossz)
 * és függőleges (magasság) vonal, a lyukakból átmérő-vonalak.
 * worldToScreen: világ → képernyő transzformáció.
 */
export function computeDimensionLines(
  mesh: Mesh,
  worldToScreen: (x: number, y: number) => { sx: number; sy: number },
  scale: number,
): DimLine[] {
  const lines: DimLine[] = [];

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const n of mesh.nodes) {
    if (n.x < minX) minX = n.x;
    if (n.x > maxX) maxX = n.x;
    if (n.y < minY) minY = n.y;
    if (n.y > maxY) maxY = n.y;
  }
  const off = 22 / Math.max(scale, 1e-9); // 22 px távolság világ-egységben

  // Vízszintes méretvonal a modell ALATT
  const yBottom = minY - off;
  const a1 = worldToScreen(minX, yBottom);
  const a2 = worldToScreen(maxX, yBottom);
  lines.push({ x1: a1.sx, y1: a1.sy, x2: a2.sx, y2: a2.sy, label: fmtLen(maxX - minX) });

  // Függőleges méretvonal a modell JOBB oldala MELLETT
  const xRight = maxX + off;
  const b1 = worldToScreen(xRight, minY);
  const b2 = worldToScreen(xRight, maxY);
  lines.push({ x1: b1.sx, y1: b1.sy, x2: b2.sx, y2: b2.sy, label: fmtLen(maxY - minY) });

  // Lyuk-átmérők (függőleges jelzővonal a lyuk közepétől)
  const holes = mesh.annotation?.holes ?? [];
  for (const h of holes) {
    const c1 = worldToScreen(h.cx, h.cy);
    lines.push({
      x1: c1.sx,
      y1: c1.sy,
      x2: c1.sx + 34,
      y2: c1.sy - 18,
      label: `Ø${fmtLen(2 * h.r)}`,
    });
  }

  return lines;
}

/** Méretvonalak kirajzolása (nyilakkal és középre igazított felirattal) */
export function drawDimensionLines(
  ctx: CanvasRenderingContext2D,
  lines: DimLine[],
): void {
  ctx.save();
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.85)';
  ctx.fillStyle = 'rgba(203, 213, 225, 0.95)';
  ctx.lineWidth = 1;
  ctx.font = '11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (const l of lines) {
    const dx = l.x2 - l.x1;
    const dy = l.y2 - l.y1;
    const len = Math.hypot(dx, dy);
    if (len < 8) continue;
    const ux = dx / len;
    const uy = dy / len;

    // fővonal
    ctx.beginPath();
    ctx.moveTo(l.x1, l.y1);
    ctx.lineTo(l.x2, l.y2);
    ctx.stroke();

    // végnyilak
    const ah = 6;
    for (const [px, py, dir] of [
      [l.x1, l.y1, 1],
      [l.x2, l.y2, -1],
    ] as const) {
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px + dir * ah * ux - ah * 0.4 * uy, py + dir * ah * uy + ah * 0.4 * ux);
      ctx.lineTo(px + dir * ah * ux + ah * 0.4 * uy, py + dir * ah * uy - ah * 0.4 * ux);
      ctx.closePath();
      ctx.fill();
    }

    // felirat a vonal közepén, enyhén eltolva
    const mx = (l.x1 + l.x2) / 2 + (Math.abs(uy) > 0.7 ? 16 : 0);
    const my = (l.y1 + l.y2) / 2 + (Math.abs(uy) > 0.7 ? 0 : -10);
    ctx.fillText(l.label, mx, my);
  }
  ctx.restore();
}

/** Infópanel tartalma: modell + statika + anyag + keresztmetszet sorok */
export function infoLines(mesh: Mesh): string[] {
  const ann: MeshAnnotation = mesh.annotation ?? {};
  const mat = mesh.material;
  const lines: string[] = [];
  if (ann.geom) lines.push(ann.geom);
  if (ann.section) lines.push(ann.section);
  if (ann.statics) lines.push(ann.statics);
  lines.push(
    `${mat.name} · E = ${mat.E >= 1e9 ? `${(mat.E / 1e9).toFixed(0)} GPa` : `${(mat.E / 1e6).toFixed(0)} MPa`} · ν = ${mat.nu}`,
  );
  return lines;
}

/**
 * Támasz-szimbólumok kirajzolása a valós geometrián:
 *  - befogás (fixed): csíkozott falszelet
 *  - csukló (pin): háromszög
 *  - görgő (rollerX/rollerY): háromszög + görgőkörök + alapvonal
 */
export function drawSupports(
  ctx: CanvasRenderingContext2D,
  mesh: Mesh,
  worldToScreen: (x: number, y: number) => { sx: number; sy: number },
): void {
  const supports = mesh.annotation?.supports ?? [];
  if (supports.length === 0) return;
  ctx.save();
  ctx.strokeStyle = 'rgba(248, 250, 252, 0.95)';
  ctx.fillStyle = 'rgba(148, 163, 184, 0.9)';
  ctx.lineWidth = 1.5;

  const S = 14; // szimbólum mérete [px]
  for (const sup of supports) {
    const { sx, sy } = worldToScreen(sup.x, sup.y);
    const dir = sup.dir ?? 'down';
    // a szimbólum a támaszpontból a `dir` irányba "lóg ki"
    const ux = dir === 'left' ? -1 : dir === 'right' ? 1 : 0;
    const uy = dir === 'up' ? -1 : dir === 'down' ? 1 : 0;

    if (sup.kind === 'fixed') {
      // falszelet, merőleges az irányra + csíkozás
      const px = -uy;
      const py = ux;
      ctx.beginPath();
      ctx.moveTo(sx + px * S, sy + py * S);
      ctx.lineTo(sx - px * S, sy - py * S);
      ctx.stroke();
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(sx + px * i * (S / 2.5), sy + py * i * (S / 2.5));
        ctx.lineTo(sx + px * i * (S / 2.5) + ux * (S / 2.5), sy + py * i * (S / 2.5) + uy * (S / 2.5));
        ctx.stroke();
      }
    } else {
      // háromszög: csúcs a támaszpont, alap kifelé
      const bx = sx + ux * S;
      const by = sy + uy * S;
      const px = -uy;
      const py = ux;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(bx + px * (S * 0.7), by + py * (S * 0.7));
      ctx.lineTo(bx - px * (S * 0.7), by - py * (S * 0.7));
      ctx.closePath();
      ctx.stroke();

      if (sup.kind === 'rollerX' || sup.kind === 'rollerY') {
        // két görgőkör az alapvonal alatt
        const r = S * 0.22;
        const off = S * 0.35;
        for (const t of [-1, 1]) {
          ctx.beginPath();
          ctx.arc(bx + px * t * off + ux * r, by + py * t * off + uy * r, r, 0, Math.PI * 2);
          ctx.stroke();
        }
        // alapvonal
        ctx.beginPath();
        ctx.moveTo(bx + px * S * 0.9 + ux * 2 * r, by + py * S * 0.9 + uy * 2 * r);
        ctx.lineTo(bx - px * S * 0.9 + ux * 2 * r, by - py * S * 0.9 + uy * 2 * r);
        ctx.stroke();
      }
    }
  }
  ctx.restore();
}

/**
 * Pontterhelés-nyilak (piros): az (x,y) támadáspontból az (fx,fy)
 * irányba "beérkező" nyíl, érték-címkével.
 */
export function drawLoadArrows(
  ctx: CanvasRenderingContext2D,
  mesh: Mesh,
  worldToScreen: (x: number, y: number) => { sx: number; sy: number },
): void {
  const loads = mesh.annotation?.pointLoads ?? [];
  if (loads.length === 0) return;
  ctx.save();
  ctx.strokeStyle = '#f87171';
  ctx.fillStyle = '#f87171';
  ctx.lineWidth = 2;
  ctx.font = '11px system-ui, sans-serif';

  for (const L of loads) {
    const mag = Math.hypot(L.fx, L.fy);
    if (mag < 1e-12) continue;
    // a nyíl a terheléssel ELLENTÉTES irányból érkezik (a szerkezetre mutat)
    const ux = -L.fx / mag;
    const uy = L.fy / mag; // képernyő-Y tükrözés
    // világ-irány → képernyő-irány: sx nő x-szel, sy csökken y-nal
    const sux = -L.fx / mag;
    const suy = L.fy / mag;
    void ux; void uy;
    const { sx, sy } = worldToScreen(L.x, L.y);
    const len = 42;
    const ex = sx + sux * len;
    const ey = sy + suy * len;

    ctx.beginPath();
    ctx.moveTo(ex, ey);
    ctx.lineTo(sx, sy);
    ctx.stroke();
    // nyílhegy a támadásponton
    const ah = 8;
    const ang = Math.atan2(sy - ey, sx - ex);
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx - ah * Math.cos(ang - 0.4), sy - ah * Math.sin(ang - 0.4));
    ctx.lineTo(sx - ah * Math.cos(ang + 0.4), sy - ah * Math.sin(ang + 0.4));
    ctx.closePath();
    ctx.fill();

    if (L.label) {
      ctx.textAlign = sux < 0 ? 'left' : 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(L.label, ex + sux * 4, ey + suy * 4 - 8);
    }
  }
  ctx.restore();
}

/**
 * Elosztott terhelés sémája: vízszintes szakasz fölött sorozat-nyilak
 * és fedővonal, qy érték-címkével.
 */
export function drawDistributedLoads(
  ctx: CanvasRenderingContext2D,
  mesh: Mesh,
  worldToScreen: (x: number, y: number) => { sx: number; sy: number },
): void {
  const loads = mesh.annotation?.distLoads ?? [];
  if (loads.length === 0) return;
  ctx.save();
  ctx.strokeStyle = '#fb923c';
  ctx.fillStyle = '#fb923c';
  ctx.lineWidth = 1.5;
  ctx.font = '11px system-ui, sans-serif';

  for (const q of loads) {
    const a = worldToScreen(q.x1, q.y1);
    const b = worldToScreen(q.x2, q.y2);
    const len = Math.hypot(b.sx - a.sx, b.sy - a.sy);
    const nArrows = Math.max(4, Math.min(12, Math.round(len / 28)));
    const h = 30; // nyílhossz [px]
    const dirY = q.qy <= 0 ? -1 : 1; // lefelé nyomó q → nyilak felülről érkeznek

    // fedővonal
    ctx.beginPath();
    ctx.moveTo(a.sx, a.sy - dirY * h);
    ctx.lineTo(b.sx, b.sy - dirY * h);
    ctx.stroke();

    for (let i = 0; i <= nArrows; i++) {
      const t = i / nArrows;
      const x = a.sx + (b.sx - a.sx) * t;
      const yTop = a.sy - dirY * h;
      const yTip = a.sy + (b.sy - a.sy) * t;
      ctx.beginPath();
      ctx.moveTo(x, yTop);
      ctx.lineTo(x, yTip);
      ctx.stroke();
      const ah = 5;
      ctx.beginPath();
      ctx.moveTo(x, yTip);
      ctx.lineTo(x - ah, yTip - dirY * ah);
      ctx.lineTo(x + ah, yTip - dirY * ah);
      ctx.closePath();
      ctx.fill();
    }

    // címke
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    const label = `q = ${Math.abs(q.qy) >= 1000 ? `${(Math.abs(q.qy) / 1000).toFixed(1)} kN/m` : `${Math.abs(q.qy).toFixed(0)} N/m`}`;
    ctx.fillText(label, (a.sx + b.sx) / 2, Math.min(a.sy, b.sy) - dirY * h - 4);
  }
  ctx.restore();
}

/** Infópanel kirajzolása a vászon bal felső sarkába */
export function drawInfoPanel(
  ctx: CanvasRenderingContext2D,
  mesh: Mesh,
  canvasWidth: number,
): void {
  const lines = infoLines(mesh);
  ctx.save();
  ctx.font = '11px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';

  const pad = 8;
  const lineH = 15;
  const wMax = Math.max(...lines.map((s) => ctx.measureText(s).width));
  const boxW = Math.min(wMax + 2 * pad, canvasWidth - 20);
  const boxH = lines.length * lineH + 2 * pad - 3;

  ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
  ctx.beginPath();
  roundRectPath(ctx, 10, 10, boxW, boxH, 6);
  ctx.fill();
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.3)';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = 'rgba(226, 232, 240, 0.92)';
  lines.forEach((s, i) => {
    ctx.fillText(s, 10 + pad, 10 + pad + i * lineH);
  });
  ctx.restore();
}

/** roundRect path — régebbi böngészőkhöz fallback-kel */
function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, w, h, r);
    return;
  }
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}
