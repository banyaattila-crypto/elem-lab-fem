/**
 * 6. modell: Kétlyukú lemez
 * Egyirányú húzás alatt álló lemez két körlyukkal (fúrás-sor).
 * Klasszikus gépészeti példa: csavaros kötés lyrája.
 *   σ_névleges = σ₀ / (1 − d/W) a lyukak során átmenő keresztmetszeten,
 * a lyuk szélén további feszültségkoncentráció (Kt ≈ 2–3, d/W függő).
 *
 * Háló: strukturált rács, a lyukakon belüli elemek eltávolítása —
 * ugyanaz a módszer, mint a egylyukú modellnél (ismert korláttal:
 * a lépcsős lyukhatár élsarkai miatt a Kt konzervatívan túlbecsült).
 */

import type { Element, Mesh, Vec2 } from '../fem/types';
import { MATERIALS, compactNodes, structuredGrid, type MaterialKey } from './meshgen';

export interface PlateTwoHolesOptions {
  /** Lemez szélessége (X, terhelés iránya) [m] */
  W?: number;
  /** Lemez magassága (Y, lyukak iránya) [m] */
  H?: number;
  /** Lyuk sugara [m] */
  holeR?: number;
  /** Lyukak középvonala (Y-távolság a szélektől szimmetrikusan) — számolt */
  thickness?: number;
  material?: MaterialKey;
  /** Névleges húzófeszültség σ₀ az élvonalon [Pa] */
  sigma0?: number;
  /** Háló finomság (1..4) */
  density?: number;
}

export function buildPlateTwoHoles(opts: PlateTwoHolesOptions = {}): Mesh {
  const W = opts.W ?? 1.2;
  const H = opts.H ?? 1.6;
  const holeR = opts.holeR ?? 0.15;
  const thickness = opts.thickness ?? 0.005;
  const material = MATERIALS[opts.material ?? 'steel'];
  const sigma0 = opts.sigma0 ?? 1e6;
  const density = opts.density ?? 3;

  const cy1 = H * 0.3;
  const cy2 = H * 0.7;
  const cx = W / 2;

  if (holeR >= Math.min(cy1, cy2 - cy1, H - cy2) || holeR >= W / 2 - 0.05 * W) {
    throw new Error('A lyukak túl nagyok: sugár kisebb legyen, mint a szélek és a lyukak fele távolsága');
  }

  const nx = Math.max(18, 12 * density);
  const ny = Math.max(24, Math.round((nx * H) / W));

  const grid = structuredGrid(W, H, nx, ny);

  // Elemek eltávolítása, ha a súlypontja valamelyik lyukon belül van
  const keptElements: Element[] = [];
  for (const elem of grid.elements) {
    const p1 = grid.nodes[elem.nodes[0]!]!;
    const p2 = grid.nodes[elem.nodes[1]!]!;
    const p3 = grid.nodes[elem.nodes[2]!]!;
    const gx = (p1.x + p2.x + p3.x) / 3;
    const gy = (p1.y + p2.y + p3.y) / 3;
    const inHole1 = (gx - cx) ** 2 + (gy - cy1) ** 2 < holeR * holeR;
    const inHole2 = (gx - cx) ** 2 + (gy - cy2) ** 2 < holeR * holeR;
    if (!inHole1 && !inHole2) keptElements.push(elem);
  }

  const { nodes, elements } = compactNodes(grid.nodes, keptElements);

  // Terhelés: σ₀ elosztva a bal és jobb él csomópontjain
  const edgeStrip = H / ny;
  const edgeForce = sigma0 * thickness * edgeStrip;

  const loads: Record<number, Vec2> = {};
  const fixed: number[] = [];

  for (const n of nodes) {
    const atLeft = Math.abs(n.x) < 1e-9;
    const atRight = Math.abs(n.x - W) < 1e-9;
    const atBottom = Math.abs(n.y) < 1e-9;

    if (atLeft) loads[n.id] = { x: -edgeForce, y: 0 };
    if (atRight) loads[n.id] = { x: edgeForce, y: 0 };

    if (atBottom && atLeft) fixed.push(n.id);
  }

  return {
    nodes,
    elements,
    material: { ...material },
    thickness,
    bc: { fixed, loads },
    type: 'plane-stress',
    annotation: {
      geom: `Kétlyukú lemez · ${fmtLen(W)}×${fmtLen(H)}`,
      section: `Lemez t = ${(thickness * 1000).toFixed(1)} mm · 2× d = ${(2 * holeR * 1000).toFixed(0)} mm`,
      statics: `Statika: egyirányú húzás σ₀ = ${fmtStress(sigma0)} · rögzített sarok`,
      holes: [
        { cx, cy: cy1, r: holeR },
        { cx, cy: cy2, r: holeR },
      ],
    },
  };
}

/** Rövid hossz-formázó a metaadatokhoz */
function fmtLen(m: number): string {
  return m >= 1 ? `${m.toFixed(2)} m` : `${(m * 1000).toFixed(0)} mm`;
}

/** Feszültség-formázó a sémához */
function fmtStress(pa: number): string {
  const a = Math.abs(pa);
  if (a >= 1e6) return `${(pa / 1e6).toFixed(2)} MPa`;
  return `${(pa / 1e3).toFixed(0)} kPa`;
}

/** Névleges nettó feszültség a lyuk-soron átmenő keresztmetszeten */
export function plateTwoHolesNetStress(
  sigma0: number,
  d: number,
  H: number,
): number {
  return sigma0 / (1 - d / H);
}
