/**
 * Canvas 2D renderer: feszültség-hőtérkép + deformált alak.
 * Egy rajzoló osztály, amelyet a fő app hív resize/solve után.
 */

import type { Mesh, SolutionResult } from '../fem/types';
import { viridis } from './colormap';
import type { ViewTransform } from './picking';
import {
  computeDimensionLines,
  drawDimensionLines,
  drawInfoPanel,
  drawSupports,
  drawLoadArrows,
  drawDistributedLoads,
} from './annotate';

/** roundRect — régebbi böngészőkhöz fallback-kel */
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

export interface RenderOptions {
  /** Deformáció-nagyítás tényező (1 = valódi) */
  deformationScale: number;
  /** Elemhély színhez használt normalizálási maximum [Pa] */
  stressMax: number;
  /** Rács (elemhatárok) megjelenítése */
  showMeshEdges: boolean;
  /** Kiemelendő elem id-ja (vagy null) */
  highlight?: number | null;
  /** Kiemelendő csomópont id-ja (vagy null) */
  highlightNode?: number | null;
  /** Animációs fázis [0..1]: 0 = deformálatlan, 1 = teljes deformáció (alapérték 1) */
  phase?: number;
}

export const DEFAULT_RENDER_OPTIONS: RenderOptions = {
  deformationScale: 500,
  stressMax: 1,
  showMeshEdges: true,
};

export class Renderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  /** Az utolsó render világ→képernyő transzformációja (picking-hez) */
  lastView: ViewTransform | null = null;
  /** Felhasználói zoom (1 = auto-fit) */
  zoom = 1;
  /** Eltolás a fit-középponthoz képest [világ egység] */
  panX = 0;
  panY = 0;
  private lastMeshRef: Mesh | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context nem elérhető');
    this.ctx = ctx;
  }

  /** A modell világkoordinátáinak befoglaló téglalapja */
  private bounds(mesh: Mesh) {
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
    return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
  }

  /**
   * Kirajzolja a deformált alakot elemenkénti színnel.
   * Az Y tengelyt tükrözzük (a világból a képernyőre).
   */
  render(mesh: Mesh, sol: SolutionResult, opts: RenderOptions): void {
    const ctx = this.ctx;
    const { width, height } = this.canvas;

    // háttér
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, width, height);

    const b = this.bounds(mesh);
    const pad = 40;
    // A deformált alak is beleférjen: a maximális (phase = 1) deformált csomópont-
    // pozíciók kiterjedését egyesítjük az alak befoglalójával. A nézet mindkét
    // tengelyen középre igazít, így a rajz sosem lapul a keret aljára/oldalára.
    const ext = deformationExtent(mesh, sol, opts.deformationScale);
    const minX = Math.min(b.minX, ext.minX);
    const maxX = Math.max(b.maxX, ext.maxX);
    const minY = Math.min(b.minY, ext.minY);
    const maxY = Math.max(b.maxY, ext.maxY);
    const w = Math.max(maxX - minX, 1e-9);
    const h = Math.max(maxY - minY, 1e-9);
    const baseScale = Math.min((width - 2 * pad) / w, (height - 2 * pad) / h);
    // Új modell → nézet visszaállítása
    if (mesh !== this.lastMeshRef) {
      this.zoom = 1;
      this.panX = 0;
      this.panY = 0;
      this.lastMeshRef = mesh;
    }
    const midX = (minX + maxX) / 2 + this.panX;
    const midY = (minY + maxY) / 2 + this.panY;
    const scale = baseScale * this.zoom;
    this.lastView = { midX, midY, scale, canvasWidth: width, canvasHeight: height };

    // világ → képernyő transzformáció (deformált koordinátákkal)
    const phase = opts.phase ?? 1;
    const tx = (x: number, y: number, id: number) => {
      const d = sol.displacements.get(id) ?? { x: 0, y: 0 };
      const dx = x + d.x * opts.deformationScale * phase;
      const dy = y + d.y * opts.deformationScale * phase;
      return {
        sx: width / 2 + (dx - midX) * scale,
        sy: height / 2 - (dy - midY) * scale,
      };
    };

    for (const elem of mesh.elements) {
      // Mindkét elem-típusnál a 3 SAROK csomópont adja a rajzolható háromszöget
      const [i1, i2, i3] = elem.nodes;
      const p1 = mesh.nodes[i1]!;
      const p2 = mesh.nodes[i2]!;
      const p3 = mesh.nodes[i3]!;

      const stress = sol.stresses.get(elem.id);
      const t = stress ? Math.min(1, stress.vonMises / opts.stressMax) : 0;

      const s1 = tx(p1.x, p1.y, p1.id);
      const s2 = tx(p2.x, p2.y, p2.id);
      const s3 = tx(p3.x, p3.y, p3.id);

      ctx.beginPath();
      ctx.moveTo(s1.sx, s1.sy);
      ctx.lineTo(s2.sx, s2.sy);
      ctx.lineTo(s3.sx, s3.sy);
      ctx.closePath();
      ctx.fillStyle = viridisCss(t);
      ctx.fill();

      if (opts.showMeshEdges) {
        ctx.strokeStyle = 'rgba(15,23,42,0.35)';
        ctx.lineWidth = 0.5;
        ctx.stroke();
        // T6: az oldalközép-csomópontokat is bemutatjuk (rácsellenőrzés)
        if ((mesh.elementType ?? 'CST') === 'T6' && elem.nodes.length >= 6) {
          ctx.fillStyle = 'rgba(226,232,240,0.5)';
          for (let m = 3; m < Math.min(6, elem.nodes.length); m++) {
            const pm = mesh.nodes[elem.nodes[m]!]!;
            const sm = tx(pm.x, pm.y, pm.id);
            ctx.beginPath();
            ctx.arc(sm.sx, sm.sy, 1.2, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
    }

    // Kiválasztott elem kiemelése
    if (opts.highlight != null) {
      const elem = mesh.elements.find((e) => e.id === opts.highlight);
      if (elem) {
        const [i1, i2, i3] = elem.nodes;
        const p1 = mesh.nodes[i1]!;
        const p2 = mesh.nodes[i2]!;
        const p3 = mesh.nodes[i3]!;
        const s1 = tx(p1.x, p1.y, p1.id);
        const s2 = tx(p2.x, p2.y, p2.id);
        const s3 = tx(p3.x, p3.y, p3.id);
        ctx.beginPath();
        ctx.moveTo(s1.sx, s1.sy);
        ctx.lineTo(s2.sx, s2.sy);
        ctx.lineTo(s3.sx, s3.sy);
        ctx.closePath();
        ctx.strokeStyle = '#f87171';
        ctx.lineWidth = 2.5;
        ctx.stroke();
        // csomópontok
        ctx.fillStyle = '#fbbf24';
        for (const s of [s1, s2, s3]) {
          ctx.beginPath();
          ctx.arc(s.sx, s.sy, 3.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // Kiválasztott csomópont kiemelése (deformált pozíción)
    if (opts.highlightNode != null) {
      const node = mesh.nodes[opts.highlightNode];
      if (node) {
        const s = tx(node.x, node.y, node.id);
        ctx.beginPath();
        ctx.arc(s.sx, s.sy, 7, 0, Math.PI * 2);
        ctx.strokeStyle = '#f87171';
        ctx.lineWidth = 2.5;
        ctx.stroke();
        ctx.fillStyle = '#fbbf24';
        ctx.beginPath();
        ctx.arc(s.sx, s.sy, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Színskála-jelmagyarázat a vászonra rajzolva
    this.drawLegend(ctx, opts.stressMax, opts.deformationScale);

    // Méretvonalak + anyag/keresztmetszet infó (csak 2D nézetben, alaphelyzetű zoom mellett is jól működik)
    const v = this.lastView;
    if (v) {
      const worldToScreen = (x: number, y: number) => ({
        sx: v.canvasWidth / 2 + (x - v.midX) * v.scale,
        sy: v.canvasHeight / 2 - (y - v.midY) * v.scale,
      });
      const dims = computeDimensionLines(mesh, worldToScreen, v.scale);
      drawDimensionLines(ctx, dims);
      drawSupports(ctx, mesh, worldToScreen);
      drawLoadArrows(ctx, mesh, worldToScreen);
      drawDistributedLoads(ctx, mesh, worldToScreen);
      drawInfoPanel(ctx, mesh, width);
    }
  }

  /**
   * Színskála-jelmagyarázat a vászonra rajzolva (Canvas 2D nézet):
   * Viridis sáv + 0/max Von Mises érték + deformáció-méretarány.
   */
  private drawLegend(ctx: CanvasRenderingContext2D, stressMax: number, defscale: number): void {
    const { width, height } = this.canvas;
    const barW = 150;
    const barH = 10;
    const x0 = width - barW - 16;
    const y0 = height - 32;

    ctx.save();
    // háttérpanel
    ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
    ctx.beginPath();
    roundRectPath(ctx, x0 - 8, y0 - 18, barW + 16, barH + 30, 6);
    ctx.fill();

    // színskála (sűrű csíkozás = folytonos hatás)
    const steps = 60;
    for (let i = 0; i < steps; i++) {
      ctx.fillStyle = viridisCss(i / (steps - 1));
      ctx.fillRect(x0 + (i * barW) / steps, y0, barW / steps + 1, barH);
    }
    ctx.strokeStyle = 'rgba(226, 232, 240, 0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x0, y0, barW, barH);

    // feliratok
    ctx.fillStyle = 'rgba(226, 232, 240, 0.9)';
    ctx.font = '10px system-ui, sans-serif';
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.fillText('0', x0, y0 + barH + 4);
    ctx.textAlign = 'right';
    ctx.fillText(formatPaStress(stressMax), x0 + barW, y0 + barH + 4);
    ctx.textBaseline = 'bottom';
    ctx.textAlign = 'left';
    ctx.fillText('Von Mises', x0, y0 - 3);
    ctx.textAlign = 'right';
    ctx.fillText(`deformáció ×${fmtScale(defscale)}`, x0 + barW, y0 - 3);
    ctx.restore();
  }

  /**
   * Görgős zoom: a mutató alatti világpont rögzítve marad a képernyőn.
   * `factor` > 1 = nagyítás, < 1 = kicsinyítés.
   */
  zoomAt(sx: number, sy: number, factor: number): void {
    const v = this.lastView;
    if (!v) return;
    const wx = v.midX + (sx - v.canvasWidth / 2) / v.scale;
    const wy = v.midY + (v.canvasHeight / 2 - sy) / v.scale;
    const oldZoom = this.zoom;
    this.zoom = Math.min(64, Math.max(0.5, oldZoom * factor));
    const s = (v.scale / oldZoom) * this.zoom;
    // Az új középpont úgy állítódik be, hogy (wx, wy) a régiben (sx, sy) maradjon
    const newMidX = wx - (sx - v.canvasWidth / 2) / s;
    const newMidY = wy + (sy - v.canvasHeight / 2) / s;
    this.panX += newMidX - v.midX;
    this.panY += newMidY - v.midY;
  }

  /** Húzásos mozgatás képernyő-pixelekben (a képernyő Y tengelye tükrözött!) */
  panBy(dsx: number, dsy: number): void {
    const v = this.lastView;
    if (!v) return;
    this.panX -= dsx / v.scale;
    this.panY += dsy / v.scale;
  }

  /** Nézet visszaállítása auto-fit-re */
  resetView(): void {
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
  }
}

/**
 * A maximálisan deformált alak (phase = 1) befoglaló téglalapja.
 * A kisebb fázisú animációk e két alak konvex kombinációja, így az erre
 * méretezett nézet minden fázisban kívül eső részt nem vág le.
 */
function deformationExtent(
  mesh: Mesh,
  sol: SolutionResult,
  deformationScale: number,
): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const n of mesh.nodes) {
    const d = sol.displacements.get(n.id) ?? { x: 0, y: 0 };
    const x = n.x + d.x * deformationScale;
    const y = n.y + d.y * deformationScale;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
}

function viridisCss(t: number): string {
  const { r, g, b } = viridis(t);
  return `rgb(${r},${g},${b})`;
}

/** Feszültség emberi formátumban a canvas-jelmagyarázathoz */
function formatPaStress(v: number): string {
  const a = Math.abs(v);
  if (a < 1e-12) return '0';
  if (a >= 1e9) return `${(v / 1e9).toFixed(2)} GPa`;
  if (a >= 1e6) return `${(v / 1e6).toFixed(2)} MPa`;
  if (a >= 1e3) return `${(v / 1e3).toFixed(1)} kPa`;
  return `${v.toFixed(1)} Pa`;
}

/** Deformáció-nagyítás tömör címkéje */
function fmtScale(v: number): string {
  if (v >= 1000) return `${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}k`;
  return `${v}`;
}
