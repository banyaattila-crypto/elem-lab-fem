/**
 * 3. modell: Lyukas lemez
 * Egyirányú húzás alatt álló lemez középen körlyukkal.
 * Klasszikus feszültségkoncentrációs példa:
 *   σ_max ≈ 3σ₀ a lyuk szélén (Kt ≈ 3, d/W → 0 határeset)
 *
 * Háló: strukturált rács, a körlyukon belüli elemek eltávolítása.
 *
 * ISMERT KORLÁT (mérve, 2026-09-26): a lépcsős lyukhatár újrameneti sarkai
 * szinguláris pontok, a mért Kt durva–közepes hálón 4,1–5,0 (készített
 * körre-projekciós kísérlet szilánk-háromszögek miatt rosszabb volt és
 * a sűrűséggel divergált → visszavonva, lásd STATUS_REPORT.md napló).
 * A pontos Kt≈3 valódi határkövető hálót (Delaunay/advancing-front) igényel.
 */

import type { Element, Mesh, Vec2 } from '../fem/types';
import { MATERIALS, compactNodes, structuredGrid } from './meshgen';

export interface PlateWithHoleOptions {
  /** Lemez szélessége (X) [m] */
  W?: number;
  /** Lemez magassága (Y) [m] */
  H?: number;
  /** Lyuk sugara [m] */
  holeR?: number;
  /** Lemezvastagság [m] */
  thickness?: number;
  material?: keyof typeof MATERIALS;
  /** Névleges húzófeszültség σ₀ az élvonalon [Pa] */
  sigma0?: number;
  /** Háló finomság (1..4) */
  density?: number;
}

export function buildPlateWithHole(opts: PlateWithHoleOptions = {}): Mesh {
  const W = opts.W ?? 1;
  const H = opts.H ?? 2;
  const holeR = opts.holeR ?? 0.2;
  const thickness = opts.thickness ?? 0.005;
  const material = MATERIALS[opts.material ?? 'steel'];
  const sigma0 = opts.sigma0 ?? 1e6;
  const density = opts.density ?? 3;

  if (holeR >= W / 2 || holeR >= H / 2) {
    throw new Error('A lyuk sugara kisebb legyen, mint W/2 és H/2');
  }

  const nx = Math.max(16, 10 * density);
  const ny = Math.max(24, Math.round((nx * H) / W));

  const grid = structuredGrid(W, H, nx, ny);

  // Elemek eltávolítása, ha a súlypontja a lyukon belül van
  const cx = W / 2;
  const cy = H / 2;
  const keptElements: Element[] = [];
  for (const elem of grid.elements) {
    const p1 = grid.nodes[elem.nodes[0]!]!;
    const p2 = grid.nodes[elem.nodes[1]!]!;
    const p3 = grid.nodes[elem.nodes[2]!]!;
    const gx = (p1.x + p2.x + p3.x) / 3;
    const gy = (p1.y + p2.y + p3.y) / 3;
    const distSq = (gx - cx) ** 2 + (gy - cy) ** 2;
    if (distSq > holeR * holeR) {
      keptElements.push(elem);
    }
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
  };
}

/** Analitikus feszültségkoncentrációs tényező (d/W → 0 határeset): Kt = 3 */
export function plateWithHoleKt(): number {
  return 3;
}
