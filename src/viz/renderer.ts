/**
 * Canvas 2D renderer: feszültség-hőtérkép + deformált alak.
 * Egy rajzoló osztály, amelyet a fő app hív resize/solve után.
 */

import type { Mesh, SolutionResult } from '../fem/types';
import { viridis } from './colormap';
import type { ViewTransform } from './picking';

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
  lastView: (ViewTransform & { minY: number }) | null = null;

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
    const pad = 30;
    const scale = Math.min(
      (width - 2 * pad) / Math.max(b.w, 1e-9),
      (height - 2 * pad) / Math.max(b.h, 1e-9),
    );
    this.lastView = { pad, scale, minX: b.minX, minY: b.minY, canvasHeight: height };

    // világ → képernyő transzformáció (deformált koordinátákkal)
    const tx = (x: number, y: number, id: number) => {
      const d = sol.displacements.get(id) ?? { x: 0, y: 0 };
      const dx = x + d.x * opts.deformationScale;
      const dy = y + d.y * opts.deformationScale;
      return {
        sx: pad + (dx - b.minX) * scale,
        sy: height - pad - (dy - b.minY) * scale,
      };
    };

    for (const elem of mesh.elements) {
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
  }
}

function viridisCss(t: number): string {
  const { r, g, b } = viridis(t);
  return `rgb(${r},${g},${b})`;
}
