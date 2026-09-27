/**
 * Canvas 2D renderer a vázmodellekhez (frame.ts megoldó szerint).
 * A rúd/elem alakja Hermite-alakfüggvényekkel deformált görbe, a színezés az
 * elem szélsőfeszültségéé (max|σ_top|,|σ_bot|). A támasz-/teher-annotációk a
 * corbel/lemez-pálya meglévő rajzolóit használják egy virtuális Mesh-en.
 */

import type { FrameMaterial, FrameModel, FrameSolution } from '../fem/frame';
import { frameBeamLocalDisp } from '../fem/frame';
import type { Mesh, MeshAnnotation, SolutionResult, Vec2 } from '../fem/types';
import { stressCss } from './colormap';
import { isDarkTheme } from './theme';
import type { ViewTransform } from './picking';
import {
  computeDimensionLines,
  drawDimensionLines,
  drawInfoPanel,
  drawSupports,
  drawReactionValues,
  drawLoadArrows,
  drawDistributedLoads,
} from './annotate';

export interface FrameRenderOptions {
  deformationScale: number;
  stressMax: number;
  highlight?: number | null;
  highlightNode?: number | null;
  phase?: number;
}

/** Hermite-alakfüggvények (a lokális transzverz lehajlás s-ben) */
function hermite(t: number): [number, number, number, number] {
  const t2 = t * t;
  const t3 = t2 * t;
  return [
    2 * t3 - 3 * t2 + 1, // φ1: v1
    t3 - 2 * t2 + t, // φ2: θ1·L
    -2 * t3 + 3 * t2, // φ3: v2
    t3 - t2, // φ4: θ2·L
  ];
}

/** Virtuális Mesh + pszeudo-Solution a meglévő annotáció-rajzolókhoz */
function buildVirtualForms(model: FrameModel, sol: FrameSolution): { mesh: Mesh; solView: SolutionResult } {
  const supports = model.supports
    .filter((s) => s.kind !== 'spring')
    .map((s) => {
      const node = model.nodes[s.nodeId]!;
      const kind =
        s.kind === 'fixed' ? 'fixed' : s.kind === 'pin' ? 'pin' : s.kind === 'rollerX' ? 'rollerX' : 'rollerY';
      return { x: node.x, y: node.y, kind: kind as 'fixed' | 'pin' | 'rollerX' | 'rollerY', dir: 'down' as const };
    });

  const pointLoads = model.pointLoads.map((p) => {
    const node = model.nodes[p.nodeId]!;
    return { x: node.x, y: node.y, fx: p.fx, fy: p.fy };
  });

  const distLoads = model.distLoads.map((d) => {
    const beam = model.beams.find((b) => b.id === d.beamId);
    if (!beam) return null;
    const a = model.nodes[beam.nodeI]!;
    const b = model.nodes[beam.nodeJ]!;
    return { x1: a.x, y1: a.y, x2: b.x, y2: b.y, qy: d.qy };
  }).filter((d): d is NonNullable<typeof d> => d != null);

  const annotation: MeshAnnotation = {
    geom: frameGeoText(model),
    statics: frameStaticsText(model),
    supports,
    pointLoads,
    distLoads,
  };

  const mesh = {
    nodes: model.nodes as Mesh['nodes'],
    elements: [],
    material: {
      name: model.material.name,
      E: model.material.E,
      nu: model.material.nu,
      density: model.material.rho,
    },
    thickness: 1,
    bc: { fixed: [], loads: {} },
    type: 'plane-stress' as const,
    annotation,
  } as unknown as Mesh;

  const solView = {
    displacements: new Map<number, Vec2>(),
    stresses: new Map(),
    reactions: sol.reactions as unknown as Map<number, Vec2>,
    maxDisplacement: sol.maxDisplacement,
    maxVonMises: sol.maxStress,
    iterations: sol.iterations,
    residual: sol.residual,
  } as SolutionResult;

  return { mesh, solView };
}

function frameGeoText(model: FrameModel): string {
  const xs = model.nodes.map((n) => n.x);
  const ys = model.nodes.map((n) => n.y);
  const w = Math.max(...xs) - Math.min(...xs);
  const h = Math.max(...ys) - Math.min(...ys);
  return `${model.memberType === 'bar' ? 'Rács' : 'Váz'} · ${model.beams.length} rúd · ${model.nodes.length} csomó · ~${w.toFixed(1)}×${h.toFixed(1)} m`;
}

function frameStaticsText(model: FrameModel): string {
  const fixedKinds = model.supports.map((s) => s.kind).join('+');
  const P = model.pointLoads.length > 0 ? ' + P pontterhelés' : '';
  const q = model.distLoads.length > 0 ? ' + q megoszló' : '';
  return `Statika: ${fixedKinds}${P}${q}`;
}

/** Anyag-információ a renderer infópaneljéhez és kinyeréshez */
export function frameMaterialText(material: FrameMaterial): string {
  return `${material.name} · E = ${material.E >= 1e9 ? `${(material.E / 1e9).toFixed(0)} GPa` : `${(material.E / 1e6).toFixed(0)} MPa`} · ν = ${material.nu}`;
}

/**
 * Váz-renderer — a Renderer (lemez) nézet-kezelésével egyező felülettel,
 * hogy a main.ts zoom/pan/húzás logikája közös legyen.
 */
export class FrameRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  lastView: ViewTransform | null = null;
  zoom = 1;
  panX = 0;
  panY = 0;
  private lastModelRef: FrameModel | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context nem elérhető (FrameRenderer)');
    this.ctx = ctx;
  }

  private paintBackdrop(width: number, height: number): void {
    const ctx = this.ctx;
    const dark = isDarkTheme();
    const grad = ctx.createLinearGradient(0, 0, width, height);
    if (dark) {
      grad.addColorStop(0, '#0e1830');
      grad.addColorStop(1, '#0a1120');
    } else {
      grad.addColorStop(0, '#eef3ff');
      grad.addColorStop(0.55, '#e9edfd');
      grad.addColorStop(1, '#f2ecff');
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
  }

  private bounds(model: FrameModel) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const n of model.nodes) {
      if (n.x < minX) minX = n.x;
      if (n.x > maxX) maxX = n.x;
      if (n.y < minY) minY = n.y;
      if (n.y > maxY) maxY = n.y;
    }
    return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
  }

  render(model: FrameModel, sol: FrameSolution, opts: FrameRenderOptions): void {
    const ctx = this.ctx;
    const { width, height } = this.canvas;
    this.paintBackdrop(width, height);

    const b = this.bounds(model);
    const pad = 40;
    const DS = opts.deformationScale;
    const bds = this.deformationExtent(model, sol, DS);
    const minX = Math.min(b.minX, bds.minX);
    const maxX = Math.max(b.maxX, bds.maxX);
    const minY = Math.min(b.minY, bds.minY);
    const maxY = Math.max(b.maxY, bds.maxY);
    const w = Math.max(maxX - minX, 1e-9);
    const h2 = Math.max(maxY - minY, 1e-9);
    const baseScale = Math.min((width - 2 * pad) / w, (height - 2 * pad) / h2);

    if (model !== this.lastModelRef) {
      this.zoom = 1;
      this.panX = 0;
      this.panY = 0;
      this.lastModelRef = model;
    }
    const midX = (minX + maxX) / 2 + this.panX;
    const midY = (minY + maxY) / 2 + this.panY;
    const scale = baseScale * this.zoom;
    this.lastView = { midX, midY, scale, canvasWidth: width, canvasHeight: height };

    const toScreen = (x: number, y: number) => ({
      sx: width / 2 + (x - midX) * scale,
      sy: height / 2 - (y - midY) * scale,
    });

    const phase = opts.phase ?? 1;
    const stressMax = Math.max(opts.stressMax, 1);
    const segs = model.memberType === 'beam' ? 14 : 2;
    const band = model.memberType === 'beam';
    const section = model.sections[model.beams[0]?.sectionId ?? ''] ;

    for (const beam of model.beams) {
      const local = frameBeamLocalDisp(model, sol, beam.id);
      if (!local) continue;
      const res = sol.beams.get(beam.id);
      const half = band ? ((section?.h ?? 0.1) / 2) * scale : 1.5;

      const pts: Array<{ sx: number; sy: number; norm: number }> = [];
      for (let k = 0; k <= segs; k++) {
        const t = k / segs;
        const s = t * local.L;
        const [h1, h2f, h3, h4f] = hermite(t);
        const uL = ((1 - t) * local.d[0]! + t * local.d[3]!) * DS * phase;
        const vL = (h1 * local.d[1]! + h2f * local.d[2]! * local.L + h3 * local.d[4]! + h4f * local.d[5]! * local.L) * DS * phase;
        const gx = local.x1 + local.c * (s + uL) + -local.s * vL;
        const gy = local.y1 + local.s * (s + uL) + local.c * vL;
        // színnormálás: legközelebbi σ-minta a szakaszon
        let norm = 0;
        const smp = res?.samples ?? [];
        if (smp.length > 0) {
          const si = Math.min(smp.length - 1, Math.round((k / segs) * (smp.length - 1)));
          norm = Math.min(1, Math.max(Math.abs(smp[si]!.sigmaTop), Math.abs(smp[si]!.sigmaBot)) / stressMax);
        }
        pts.push({ ...toScreen(gx, gy), norm });
      }

      for (let k = 0; k < segs; k++) {
        const a = pts[k]!;
        const bb = pts[k + 1]!;
        const fillT = (a.norm + bb.norm) / 2;
        if (band) {
          // rúd: vastag sáv, merőleges eltolással (±h/2·scale)
          const dx = bb.sx - a.sx;
          const dy = bb.sy - a.sy;
          const len = Math.hypot(dx, dy) || 1e-9;
          const px = (-dy / len) * half;
          const py = (dx / len) * half;
          ctx.beginPath();
          ctx.moveTo(a.sx + px, a.sy + py);
          ctx.lineTo(bb.sx + px, bb.sy + py);
          ctx.lineTo(bb.sx - px, bb.sy - py);
          ctx.lineTo(a.sx - px, a.sy - py);
          ctx.closePath();
          ctx.fillStyle = stressCss(fillT);
          ctx.fill();
          ctx.strokeStyle = isDarkTheme() ? 'rgba(226,232,240,0.35)' : 'rgba(47,71,118,0.4)';
          ctx.lineWidth = 0.5;
          ctx.stroke();
        } else {
          // rácsrúd: vékony vonal
          ctx.beginPath();
          ctx.moveTo(a.sx, a.sy);
          ctx.lineTo(bb.sx, bb.sy);
          ctx.strokeStyle = stressCss(fillT);
          ctx.lineWidth = 3;
          ctx.stroke();
        }
      }
    }

    // csomópontok (deformált pozíción)
    ctx.fillStyle = isDarkTheme() ? '#e2e8f0' : '#1e293b';
    for (const node of model.nodes) {
      const d = sol.displacements.get(node.id) ?? { u: 0, v: 0, theta: 0 };
      const p = toScreen(node.x + d.u * DS * phase, node.y + d.v * DS * phase);
      ctx.beginPath();
      ctx.arc(p.sx, p.sy, 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // kijelölt rúd kiemelése
    if (opts.highlight != null) {
      const beam = model.beams.find((b) => b.id === opts.highlight);
      if (beam) {
        const local = frameBeamLocalDisp(model, sol, beam.id);
        if (local) {
          ctx.beginPath();
          ctx.moveTo(toScreen(local.x1, local.y1).sx, toScreen(local.x1, local.y1).sy);
          ctx.lineTo(toScreen(local.x2, local.y2).sx, toScreen(local.x2, local.y2).sy);
          ctx.strokeStyle = '#f87171';
          ctx.lineWidth = 3;
          ctx.stroke();
          ctx.strokeStyle = '#fbbf24';
          ctx.lineWidth = 6;
          ctx.beginPath();
          ctx.moveTo(toScreen(local.x1, local.y1).sx, toScreen(local.x1, local.y1).sy);
          ctx.lineTo(toScreen(local.x2, local.y2).sx, toScreen(local.x2, local.y2).sy);
          ctx.stroke();
          ctx.strokeStyle = '#f87171';
          ctx.lineWidth = 1.5;
          ctx.setLineDash([5, 4]);
          ctx.beginPath();
          ctx.moveTo(toScreen(local.x1, local.y1).sx, toScreen(local.x1, local.y1).sy);
          ctx.lineTo(toScreen(local.x2, local.y2).sx, toScreen(local.x2, local.y2).sy);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
    }

    // kijelölt csomópont kiemelése
    if (opts.highlightNode != null) {
      const node = model.nodes.find((n) => n.id === opts.highlightNode);
      if (node) {
        const d = sol.displacements.get(node.id) ?? { u: 0, v: 0, theta: 0 };
        const p = toScreen(node.x + d.u * DS * phase, node.y + d.v * DS * phase);
        ctx.beginPath();
        ctx.arc(p.sx, p.sy, 7, 0, Math.PI * 2);
        ctx.strokeStyle = '#f87171';
        ctx.lineWidth = 2.5;
        ctx.stroke();
        ctx.fillStyle = '#fbbf24';
        ctx.beginPath();
        ctx.arc(p.sx, p.sy, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Legenda + annotációk (virtuális lemez-objektumokon)
    this.drawLegend(ctx, sol.maxStress, opts.deformationScale);
    const v = this.lastView;
    if (v) {
      const worldToScreen = (x: number, y: number) => ({
        sx: v.canvasWidth / 2 + (x - v.midX) * v.scale,
        sy: v.canvasHeight / 2 - (y - v.midY) * v.scale,
      });
      const { mesh, solView } = buildVirtualForms(model, sol);
      const dims = computeDimensionLines(mesh, worldToScreen, v.scale);
      drawDimensionLines(ctx, dims);
      drawSupports(ctx, mesh, worldToScreen);
      drawReactionValues(ctx, mesh, solView, worldToScreen);
      drawLoadArrows(ctx, mesh, worldToScreen);
      drawDistributedLoads(ctx, mesh, worldToScreen);
      drawInfoPanel(ctx, mesh, width);
    }
  }

  private deformationExtent(model: FrameModel, sol: FrameSolution, DS: number) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const n of model.nodes) {
      const d = sol.displacements.get(n.id) ?? { u: 0, v: 0, theta: 0 };
      const x = n.x + d.u * DS;
      const y = n.y + d.v * DS;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    return { minX, minY, maxX, maxY };
  }

  private drawLegend(ctx: CanvasRenderingContext2D, stressMax: number, defscale: number): void {
    const { width, height } = this.canvas;
    const barW = 150;
    const barH = 10;
    const x0 = width - barW - 16;
    const y0 = height - 32;
    const dark = isDarkTheme();

    ctx.save();
    ctx.fillStyle = dark ? 'rgba(13, 20, 36, 0.85)' : 'rgba(255, 255, 255, 0.92)';
    ctx.fillRect(x0 - 8, y0 - 18, barW + 16, barH + 30);
    const steps = 60;
    for (let i = 0; i < steps; i++) {
      ctx.fillStyle = stressCss(i / (steps - 1));
      ctx.fillRect(x0 + (i * barW) / steps, y0, barW / steps + 1, barH);
    }
    ctx.strokeStyle = dark ? 'rgba(226, 232, 240, 0.3)' : 'rgba(51, 65, 85, 0.3)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x0, y0, barW, barH);

    ctx.fillStyle = dark ? 'rgba(226, 232, 240, 0.9)' : 'rgba(51, 65, 85, 0.9)';
    ctx.font = '10px system-ui, sans-serif';
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.fillText('0', x0, y0 + barH + 4);
    ctx.textAlign = 'right';
    ctx.fillText(fmtPa(stressMax), x0 + barW, y0 + barH + 4);
    ctx.textBaseline = 'bottom';
    ctx.textAlign = 'left';
    ctx.fillText('σ (rúd)', x0, y0 - 3);
    ctx.textAlign = 'right';
    ctx.fillText(`deformáció ×${defscale}`, x0 + barW, y0 - 3);
    ctx.restore();
  }

  zoomAt(sx: number, sy: number, factor: number): void {
    const v = this.lastView;
    if (!v) return;
    const wx = v.midX + (sx - v.canvasWidth / 2) / v.scale;
    const wy = v.midY + (v.canvasHeight / 2 - sy) / v.scale;
    const oldZoom = this.zoom;
    this.zoom = Math.min(64, Math.max(0.5, oldZoom * factor));
    const s = (v.scale / oldZoom) * this.zoom;
    const newMidX = wx - (sx - v.canvasWidth / 2) / s;
    const newMidY = wy + (sy - v.canvasHeight / 2) / s;
    this.panX += newMidX - v.midX;
    this.panY += newMidY - v.midY;
  }

  panBy(dsx: number, dsy: number): void {
    const v = this.lastView;
    if (!v) return;
    this.panX -= dsx / v.scale;
    this.panY += dsy / v.scale;
  }

  resetView(): void {
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
  }
}

function fmtPa(v: number): string {
  const a = Math.abs(v);
  if (a < 1e-12) return '0';
  if (a >= 1e9) return `${(v / 1e9).toFixed(2)} GPa`;
  if (a >= 1e6) return `${(v / 1e6).toFixed(2)} MPa`;
  if (a >= 1e3) return `${(v / 1e3).toFixed(1)} kPa`;
  return `${v.toFixed(1)} Pa`;
}