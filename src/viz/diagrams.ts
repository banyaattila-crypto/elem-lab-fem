/**
 * M/V diagramok gerenda-modellekhez — adatkinyerés + külön panel.
 *
 * Adatmodell (sampleDiagrams):
 *  - Hajlítási szélsőfeszültség-profil: Δσ = σ_top − σ_bot az elem-sávokból
 *  - Nyíróerő: a nyomaték-profil deriváltja (klasszikus V = dM/dx)
 *
 * Rajzolás (MVPanel): saját, nagy felbontású canvas a fő vászon alatt,
 * két al-diagrammal (M felül, V alul), kurzor-kiolvasással:
 *  - függőleges kurzorvonal az egér x-pozíciójában
 *  - pöttyök a görbéken + kiolvasó doboz: x, M(x), V(x)
 */

import type { Mesh, SolutionResult } from '../fem/types';
import { isDarkTheme } from './theme';

/** Egy x-helyhez tartozó diagram-érték */
export interface DiagramSample {
  /** x [világ egység] */
  x: number;
  /** hajlítási szélsőfeszültség Δσ = σ_top − σ_bot [Pa] — M-mel arányos */
  sigmaTop: number;
  /** nyíróerő V [N] (V = dM/dx) */
  shear: number;
}

/**
 * Diagram-mintavételezés: az elemek súlypontja szerint, felső/alsó
 * elem-sávokra bontva. Ugyanazon x-re eső elemek értékei átlagolódnak.
 */
export function sampleDiagrams(
  mesh: Mesh,
  sol: SolutionResult,
): DiagramSample[] {
  // Gerenda-tengely: y-közép és x-tartomány a befoglalóból
  let minX = Infinity;
  let maxX = -Infinity;
  let sumY = 0;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const n of mesh.nodes) {
    if (n.x < minX) minX = n.x;
    if (n.x > maxX) maxX = n.x;
    if (n.y < minY) minY = n.y;
    if (n.y > maxY) maxY = n.y;
    sumY += n.y;
  }
  const midY = sumY / mesh.nodes.length;
  const H = maxY - minY;

  interface Acc { topSum: number; topN: number; botSum: number; botN: number }
  const buckets = new Map<number, Acc>();
  for (const elem of mesh.elements) {
    const pts = elem.nodes.slice(0, 3).map((nid) => mesh.nodes[nid]!);
    const gx = (pts[0]!.x + pts[1]!.x + pts[2]!.x) / 3;
    const gy = (pts[0]!.y + pts[1]!.y + pts[2]!.y) / 3;
    if (Math.abs(gy - midY) > H / 2 + 1e-9) continue;

    const s = sol.stresses.get(elem.id);
    if (!s) continue;

    const band = gy > midY ? 'top' : 'bot';
    const key = Math.round(gx * 1000) / 1000;
    const b = buckets.get(key) ?? { topSum: 0, topN: 0, botSum: 0, botN: 0 };
    if (band === 'top') {
      b.topSum += s.sigmaX;
      b.topN += 1;
    } else {
      b.botSum += s.sigmaX;
      b.botN += 1;
    }
    buckets.set(key, b);
  }

  // Első lépés: a hajlítási szélsőfeszültség-profil (Δσ = σ_top − σ_bot)
  const samples: DiagramSample[] = [];
  const keys = [...buckets.keys()].sort((a, b) => a - b);
  for (const k of keys) {
    const b = buckets.get(k)!;
    const top = b.topN > 0 ? b.topSum / b.topN : 0;
    const bot = b.botN > 0 ? b.botSum / b.botN : 0;
    samples.push({ x: k, sigmaTop: top - bot, shear: 0 });
  }

  // Második lépés: V(x) = dM/dx, ahol M = Δσ·W (W = t·H²/6)
  const W = (mesh.thickness * H * H * H / 8) / (H / 2); // = t·H²/6
  for (let i = 0; i < samples.length; i++) {
    const iPrev = Math.max(0, i - 1);
    const iNext = Math.min(samples.length - 1, i + 1);
    const dx = samples[iNext]!.x - samples[iPrev]!.x;
    if (dx < 1e-12) continue;
    const mPrev = samples[iPrev]!.sigmaTop * W;
    const mNext = samples[iNext]!.sigmaTop * W;
    samples[i]!.shear = (mNext - mPrev) / dx;
  }
  return samples;
}

/** Erő/feszültség rövid formázó */
function fmtVal(v: number, unit: string): string {
  const a = Math.abs(v);
  if (unit === 'Nm') {
    if (a >= 1e3) return `${(v / 1e3).toFixed(1)} kNm`;
    return `${v.toFixed(0)} Nm`;
  }
  if (a >= 1e3) return `${(v / 1e3).toFixed(1)} kN`;
  return `${v.toFixed(0)} N`;
}

/** Hossz formázó az x-tengelyhez */
function fmtX(m: number): string {
  return m >= 1 ? `${m.toFixed(2)} m` : `${(m * 1000).toFixed(0)} mm`;
}

/**
 * M/V panel: a fő vászon alatti önálló canvas, kurzor-kiolvasással.
 */
export class MVPanel {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private samples: DiagramSample[] = [];
  private x0w = 0;
  private x1w = 1;
  private cursorWx: number | null = null;
  /** marginalések */
  private readonly padL = 10;
  private readonly padR = 74;
  private readonly padTop = 14;
  private readonly subGap = 10;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context nem elérhető (MVPanel)');
    this.ctx = ctx;

    canvas.addEventListener('pointermove', (ev) => {
      const rect = canvas.getBoundingClientRect();
      this.cursorWx = this.screenToWorldX(ev.clientX - rect.left);
      this.draw();
    });
    canvas.addEventListener('pointerleave', () => {
      this.cursorWx = null;
      this.draw();
    });
  }

  /** Adatok frissítése a legutóbbi szimulációból */
  setData(mesh: Mesh, sol: SolutionResult): void {
    this.samples = sampleDiagrams(mesh, sol);
    if (this.samples.length > 0) {
      this.x0w = this.samples[0]!.x;
      this.x1w = this.samples[this.samples.length - 1]!.x;
    }
    this.draw();
  }

  /** Panel ürítése (nem gerenda modellnél) */
  clear(): void {
    this.samples = [];
    this.cursorWx = null;
    this.draw();
  }

  private plotLeft(): number {
    return this.padL;
  }
  private plotRight(): number {
    return Math.max(this.canvas.clientWidth - this.padR, this.padL + 40);
  }

  private screenToWorldX(sx: number): number {
    const l = this.plotLeft();
    const r = this.plotRight();
    const t = (sx - l) / Math.max(r - l, 1);
    return this.x0w + t * (this.x1w - this.x0w);
  }

  private worldToScreenX(wx: number): number {
    const l = this.plotLeft();
    const r = this.plotRight();
    const t = (wx - this.x0w) / Math.max(this.x1w - this.x0w, 1e-12);
    return l + t * (r - l);
  }

  /** Lineáris interpoláció a minták között */
  private sampleAt(wx: number): DiagramSample | null {
    const s = this.samples;
    if (s.length === 0) return null;
    if (wx <= s[0]!.x) return s[0]!;
    if (wx >= s[s.length - 1]!.x) return s[s.length - 1]!;
    for (let i = 1; i < s.length; i++) {
      if (s[i]!.x >= wx) {
        const a = s[i - 1]!;
        const b = s[i]!;
        const t = (wx - a.x) / Math.max(b.x - a.x, 1e-12);
        return {
          x: wx,
          sigmaTop: a.sigmaTop + t * (b.sigmaTop - a.sigmaTop),
          shear: a.shear + t * (b.shear - a.shear),
        };
      }
    }
    return s[s.length - 1]!;
  }

  private draw(): void {
    const ctx = this.ctx;
    const canvas = this.canvas;
    // CSS-méretre igazítás (éles kijelzőn devicePixelRatio)
    const cssW = Math.max(canvas.clientWidth, 120);
    const cssH = 170;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    const dark = isDarkTheme();
    ctx.fillStyle = dark ? 'rgba(10, 18, 34, 0.55)' : 'rgba(235, 243, 255, 0.85)';
    ctx.fillRect(0, 0, cssW, cssH);

    if (this.samples.length < 2) {
      ctx.fillStyle = dark ? 'rgba(203, 213, 225, 0.7)' : 'rgba(71, 85, 105, 0.8)';
      ctx.font = '12px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('M/V diagram — válassz gerenda-modellt', cssW / 2, cssH / 2);
      return;
    }

    const height = cssH;
    const subH = (height - this.padTop * 2 - this.subGap) / 2;
    const mTop = this.padTop;
    const vTop = this.padTop + subH + this.subGap;

    // skálák
    let maxS = 0;
    let maxV = 0;
    for (const s of this.samples) {
      maxS = Math.max(maxS, Math.abs(s.sigmaTop));
      maxV = Math.max(maxV, Math.abs(s.shear));
    }
    maxS = Math.max(maxS, 1e-9);
    maxV = Math.max(maxV, 1e-9);

    const m = dark
      ? { line: '#fbbf24', fill: 'rgba(251, 191, 36, 0.2)' }
      : { line: '#d97706', fill: 'rgba(217, 119, 6, 0.14)' };
    const v = dark
      ? { line: '#38bdf8', fill: 'rgba(56, 189, 248, 0.2)' }
      : { line: '#0284c7', fill: 'rgba(2, 132, 199, 0.14)' };

    this.drawSubPlot(mTop, subH, maxS, 'M (hajlítónyomaték)', 'sigmaTop', m, 'Nm');
    this.drawSubPlot(vTop, subH, maxV, 'V (nyíróerő)', 'shear', v, 'N');

    // kurzor
    if (this.cursorWx != null) {
      const cx = this.worldToScreenX(this.cursorWx);
      const val = this.sampleAt(this.cursorWx);
      if (val) {
        ctx.save();
        ctx.strokeStyle = dark ? 'rgba(226, 232, 240, 0.5)' : 'rgba(15, 23, 42, 0.4)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(cx, mTop);
        ctx.lineTo(cx, vTop + subH);
        ctx.stroke();
        ctx.setLineDash([]);

        // pöttyök a görbéken
        const yM = mTop + subH / 2 - (val.sigmaTop / maxS) * (subH * 0.42);
        const yV = vTop + subH / 2 - (val.shear / maxV) * (subH * 0.42);
        ctx.fillStyle = m.line;
        ctx.beginPath();
        ctx.arc(cx, yM, 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = v.line;
        ctx.beginPath();
        ctx.arc(cx, yV, 3.5, 0, Math.PI * 2);
        ctx.fill();

        // kiolvasó doboz
        const lines = [
          `x = ${fmtX(val.x)}`,
          `M = ${fmtVal(val.sigmaTop, 'Nm')}`,
          `V = ${fmtVal(val.shear, 'N')}`,
        ];
        ctx.font = '11px ui-monospace, monospace';
        const boxW = 110;
        const boxH = 3 * 15 + 8;
        let bx = cx + 8;
        if (bx + boxW > cssW - 4) bx = cx - boxW - 8;
        const by = mTop + 4;
        ctx.fillStyle = dark ? 'rgba(2, 6, 23, 0.95)' : 'rgba(255, 255, 255, 0.95)';
        ctx.fillRect(bx, by, boxW, boxH);
        ctx.strokeStyle = dark ? 'rgba(148, 163, 184, 0.5)' : 'rgba(100, 116, 139, 0.6)';
        ctx.strokeRect(bx, by, boxW, boxH);
        ctx.fillStyle = dark ? '#e2e8f0' : '#1e293b';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        lines.forEach((s, i) => ctx.fillText(s, bx + 8, by + 6 + i * 15));
        ctx.restore();
      }
    }

    // x-tengely feliratok
    ctx.fillStyle = dark ? 'rgba(148, 163, 184, 0.85)' : 'rgba(71, 85, 105, 0.85)';
    ctx.font = '10px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(fmtX(this.x0w), this.plotLeft(), height - 12);
    ctx.textAlign = 'right';
    ctx.fillText(fmtX(this.x1w), this.plotRight(), height - 12);
  }

  private drawSubPlot(
    top: number,
    subH: number,
    maxVal: number,
    label: string,
    key: 'sigmaTop' | 'shear',
    pal: { line: string; fill: string },
    unit: string,
  ): void {
    const ctx = this.ctx;
    const mid = top + subH / 2;
    const l = this.plotLeft();
    const r = this.plotRight();
    const dark = isDarkTheme();

    // alapvonal
    ctx.strokeStyle = dark ? 'rgba(148, 163, 184, 0.35)' : 'rgba(100, 116, 139, 0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(l, mid);
    ctx.lineTo(r, mid);
    ctx.stroke();

    // kitöltött terület a görbe alatt
    ctx.beginPath();
    this.samples.forEach((s, i) => {
      const px = this.worldToScreenX(s.x);
      const py = mid - (s[key] / maxVal) * (subH * 0.42);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.lineTo(r, mid);
    ctx.lineTo(l, mid);
    ctx.closePath();
    ctx.fillStyle = pal.fill;
    ctx.fill();

    // görbe
    ctx.strokeStyle = pal.line;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    this.samples.forEach((s, i) => {
      const px = this.worldToScreenX(s.x);
      const py = mid - (s[key] / maxVal) * (subH * 0.42);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();

    // feliratok
    ctx.fillStyle = pal.line;
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(label, l, top + 2);
    ctx.textAlign = 'right';
    ctx.fillText(`±${fmtVal(maxVal, unit)}`, r, top + 2);
  }
}
