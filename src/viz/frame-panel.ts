/**
 * N / M / V diagram-panel vázmodellekhez.
 *
 * A mintákat a frame.ts visszanyerés adja (rúdonkénti lokális s helyen:
 * N, M, V, σ). A diagramok a RÚDKIOSZTÁS mentén futnak: a bemeneti
 * beam-sorrend szerint az egyes rudak adatai egymás után, ívesen
 * összefűzve — nem egy rögzített x-tengelyre szorítva.
 */

import type { FrameModel, FrameSolution } from '../fem/frame';
import { isDarkTheme } from './theme';

interface ArcSample {
  arc: number;
  N: number;
  M: number;
  V: number;
}

const palette = {
  N: { line: ['#10b981', '#059669'], fill: 'rgba(16, 185, 129, 0.14)' },
  M: { line: ['#f59e0b', '#d97706'], fill: 'rgba(245, 158, 11, 0.14)' },
  V: { line: ['#0ea5e9', '#0284c7'], fill: 'rgba(14, 165, 233, 0.14)' },
};

function fmtVal(v: number, unit: 'N' | 'Nm'): string {
  const a = Math.abs(v);
  if (unit === 'Nm') {
    if (a >= 1e3) return `${(v / 1e3).toFixed(2)} kNm`;
    return `${v.toFixed(1)} Nm`;
  }
  if (a >= 1e3) return `${(v / 1e3).toFixed(2)} kN`;
  return `${v.toFixed(1)} N`;
}

function fmtLen(m: number): string {
  return m >= 1 ? `${m.toFixed(2)} m` : `${(m * 1000).toFixed(0)} mm`;
}

/** A rúdkiosztás mentén kibontott minták — model.beams sorrend szerint */
export function sampleFrameDiagrams(model: FrameModel, sol: FrameSolution): ArcSample[] {
  const out: ArcSample[] = [];
  let offset = 0;
  for (const beam of model.beams) {
    const res = sol.beams.get(beam.id);
    if (!res) continue;
    const L = Math.hypot(
      model.nodes[beam.nodeJ]!.x - model.nodes[beam.nodeI]!.x,
      model.nodes[beam.nodeJ]!.y - model.nodes[beam.nodeI]!.y,
    );
    for (const s of res.samples) {
      out.push({ arc: offset + s.s, N: s.N, M: s.M, V: s.V });
    }
    offset += L;
  }
  return out;
}

export class FrameMVPanel {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private samples: ArcSample[] = [];
  private arc0w = 0;
  private arc1w = 1;
  private cursorWx: number | null = null;
  private readonly padL = 10;
  private readonly padR = 74;
  private readonly padTop = 12;
  private readonly subGap = 8;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context nem elérhető (FrameMVPanel)');
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

  setData(model: FrameModel, sol: FrameSolution): void {
    this.samples = sampleFrameDiagrams(model, sol);
    if (this.samples.length > 0) {
      this.arc0w = this.samples[0]!.arc;
      this.arc1w = this.samples[this.samples.length - 1]!.arc;
    }
    this.draw();
  }

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
    return this.arc0w + t * (this.arc1w - this.arc0w);
  }

  private worldToScreenX(wx: number): number {
    const l = this.plotLeft();
    const r = this.plotRight();
    const t = (wx - this.arc0w) / Math.max(this.arc1w - this.arc0w, 1e-12);
    return l + t * (r - l);
  }

  private sampleAt(wx: number): ArcSample | null {
    const s = this.samples;
    if (s.length === 0) return null;
    if (wx <= s[0]!.arc) return s[0]!;
    if (wx >= s[s.length - 1]!.arc) return s[s.length - 1]!;
    for (let i = 1; i < s.length; i++) {
      if (s[i]!.arc >= wx) {
        const a = s[i - 1]!;
        const b = s[i]!;
        const t = (wx - a.arc) / Math.max(b.arc - a.arc, 1e-12);
        return {
          arc: wx,
          N: a.N + t * (b.N - a.N),
          M: a.M + t * (b.M - a.M),
          V: a.V + t * (b.V - a.V),
        };
      }
    }
    return s[s.length - 1]!;
  }

  private draw(): void {
    const ctx = this.ctx;
    const canvas = this.canvas;
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
      ctx.fillText('N/M/V diagram — válassz váz-modellt', cssW / 2, cssH / 2);
      return;
    }

    const height = cssH;
    const subH = (height - this.padTop * 2 - this.subGap * 2) / 3;
    const nTop = this.padTop;
    const mTop = nTop + subH + this.subGap;
    const vTop = mTop + subH + this.subGap;

    let maxN = 1e-9;
    let maxM = 1e-9;
    let maxV = 1e-9;
    for (const s of this.samples) {
      maxN = Math.max(maxN, Math.abs(s.N));
      maxM = Math.max(maxM, Math.abs(s.M));
      maxV = Math.max(maxV, Math.abs(s.V));
    }

    this.drawSubPlot(nTop, subH, maxN, 'N (normálerő)', 'N', palette.N, 'N');
    this.drawSubPlot(mTop, subH, maxM, 'M (hajlítónyomaték)', 'M', palette.M, 'Nm');
    this.drawSubPlot(vTop, subH, maxV, 'V (nyíróerő)', 'V', palette.V, 'N');

    if (this.cursorWx != null) {
      const cx = this.worldToScreenX(this.cursorWx);
      const val = this.sampleAt(this.cursorWx);
      if (val) {
        ctx.save();
        ctx.strokeStyle = dark ? 'rgba(226, 232, 240, 0.5)' : 'rgba(15, 23, 42, 0.4)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(cx, nTop);
        ctx.lineTo(cx, vTop + subH);
        ctx.stroke();
        ctx.setLineDash([]);

        const dots: Array<[number, number, string]> = [
          [nTop, val.N / maxN, palette.N.line[0]!],
          [mTop, val.M / maxM, palette.M.line[0]!],
          [vTop, val.V / maxV, palette.V.line[0]!],
        ];
        for (const [top, rel, col] of dots) {
          const p = top + subH / 2 - rel * (subH * 0.42);
          ctx.fillStyle = col;
          ctx.beginPath();
          ctx.arc(cx, p, 3.5, 0, Math.PI * 2);
          ctx.fill();
        }

        const lines = [
          `l = ${fmtLen(val.arc)}`,
          `N = ${fmtVal(val.N, 'N')}`,
          `M = ${fmtVal(val.M, 'Nm')}`,
          `V = ${fmtVal(val.V, 'N')}`,
        ];
        ctx.font = '11px ui-monospace, monospace';
        const boxW = 118;
        const boxH = 4 * 15 + 8;
        let bx = cx + 8;
        if (bx + boxW > cssW - 4) bx = cx - boxW - 8;
        const by = nTop + 2;
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

    ctx.fillStyle = dark ? 'rgba(148, 163, 184, 0.85)' : 'rgba(71, 85, 105, 0.85)';
    ctx.font = '10px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(fmtLen(this.arc0w), this.plotLeft(), height - 12);
    ctx.textAlign = 'right';
    ctx.fillText(fmtLen(this.arc1w), this.plotRight(), height - 12);
  }

  private drawSubPlot(
    top: number,
    subH: number,
    maxVal: number,
    label: string,
    key: 'N' | 'M' | 'V',
    pal: { line: string[]; fill: string },
    unit: 'N' | 'Nm',
  ): void {
    const ctx = this.ctx;
    const mid = top + subH / 2;
    const l = this.plotLeft();
    const r = this.plotRight();
    const dark = isDarkTheme();

    ctx.strokeStyle = dark ? 'rgba(148, 163, 184, 0.35)' : 'rgba(100, 116, 139, 0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(l, mid);
    ctx.lineTo(r, mid);
    ctx.stroke();

    ctx.beginPath();
    this.samples.forEach((s, i) => {
      const px = this.worldToScreenX(s.arc);
      const py = mid - (s[key] / maxVal) * (subH * 0.42);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.lineTo(r, mid);
    ctx.lineTo(l, mid);
    ctx.closePath();
    ctx.fillStyle = pal.fill;
    ctx.fill();

    ctx.strokeStyle = pal.line[dark ? 0 : 1]!;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    this.samples.forEach((s, i) => {
      const px = this.worldToScreenX(s.arc);
      const py = mid - (s[key] / maxVal) * (subH * 0.42);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();

    ctx.fillStyle = pal.line[dark ? 0 : 1]!;
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(label, l, top + 2);
    ctx.textAlign = 'right';
    ctx.fillText(`±${fmtVal(maxVal, unit)}`, r, top + 2);
  }
}