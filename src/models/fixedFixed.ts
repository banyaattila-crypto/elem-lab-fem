/**
 * 7. modell: Kétvégén befogott gerenda
 * Mindkét végén befogadva, felső élén elosztott terheléssel.
 * Klasszikus validációs eset:
 *   δ_mid = q·L⁴ / (384·E·I) = P·L³ / (384·E·I)  (q·L = P)
 *
 * Összehasonlítás az egyszerűen tartottal: a befogások miatt
 * a hajlás 5× kisebb — a nyomatékviselés megoszlik a mezők között.
 */

import type { Mesh, Vec2 } from '../fem/types';
import { MATERIALS, structuredGrid, type MaterialKey } from './meshgen';

export interface FixedFixedOptions {
  /** Gerenda fesztávja [m] */
  L?: number;
  /** Gerenda magassága [m] */
  H?: number;
  /** Lemezvastagság [m] */
  thickness?: number;
  material?: MaterialKey;
  /** Összes terhelő erő [N] (elosztottnál q·L, pontnál középi P) */
  loadN?: number;
  /** Terhelés-típus: középi pontterhelés vagy elosztott a felső élen */
  loadType?: 'point' | 'distributed';
  /** Háló finomság (1 = durva, 5 = finom) */
  density?: number;
}

export function buildFixedFixed(opts: FixedFixedOptions = {}): Mesh {
  const L = opts.L ?? 4;
  const H = opts.H ?? 0.4;
  const thickness = opts.thickness ?? 0.02;
  const material = MATERIALS[opts.material ?? 'steel'];
  const loadN = opts.loadN ?? 2000;
  const loadType = opts.loadType ?? 'distributed';
  const density = opts.density ?? 3;

  const nx = Math.max(8, Math.round(12 * density));
  const ny = Math.max(2, Math.round((nx * H) / L / 1.2));

  const grid = structuredGrid(L, H, nx, ny);

  const fixed: number[] = [];
  for (const n of grid.nodes) {
    const atLeft = Math.abs(n.x) < 1e-9;
    const atRight = Math.abs(n.x - L) < 1e-9;
    if (atLeft || atRight) fixed.push(n.id);
  }

  const isDistributed = loadType === 'distributed';
  const qy = -loadN / L; // N/m
  const distributed = isDistributed
    ? [{ x1: 0, y1: H, x2: L, y2: H, qy }]
    : undefined;
  const loads: Record<number, Vec2> = isDistributed
    ? {}
    : { [topMidNode(grid, L, H)]: { x: 0, y: -loadN } };

  return {
    nodes: grid.nodes,
    elements: grid.elements,
    material: { ...material },
    thickness,
    bc: { fixed, loads, distributed },
    type: 'plane-stress',
    annotation: {
      geom: `Kétvégén befogott gerenda · L = ${fmtLen(L)}`,
      section: `Keresztmetszet: t×H = ${(thickness * 1000).toFixed(0)}×${(H * 1000).toFixed(0)} mm`,
      statics: isDistributed
        ? `Statika: 2× befogás + q = ${fmtForce(Math.abs(qy))}/m elosztott`
        : `Statika: 2× befogás + ${fmtForce(loadN)} középen`,
      supports: [
        { x: 0, y: 0, kind: 'fixed' as const, dir: 'left' as const },
        { x: 0, y: H, kind: 'fixed' as const, dir: 'left' as const },
        { x: L, y: 0, kind: 'fixed' as const, dir: 'right' as const },
        { x: L, y: H, kind: 'fixed' as const, dir: 'right' as const },
      ],
      ...(isDistributed
        ? { distLoads: [{ x1: 0, y1: H, x2: L, y2: H, qy }] }
        : { pointLoads: [{ x: L / 2, y: H, fx: 0, fy: -loadN, label: fmtForce(loadN) }] }),
    },
  };
}

/** A felső él középső csomópontjának id-ja */
function topMidNode(
  grid: { nodes: Array<{ id: number; x: number; y: number }> },
  L: number,
  H: number,
): number {
  let best = grid.nodes[0]!;
  let bestDist = Infinity;
  for (const n of grid.nodes) {
    const dist = Math.hypot(n.x - L / 2, n.y - H);
    if (dist < bestDist) {
      bestDist = dist;
      best = n;
    }
  }
  return best.id;
}

/** Rövid hossz-formázó a metaadatokhoz */
function fmtLen(m: number): string {
  return m >= 1 ? `${m.toFixed(2)} m` : `${(m * 1000).toFixed(0)} mm`;
}

/** Erő-formázó a sémához */
function fmtForce(n: number): string {
  return Math.abs(n) >= 1000 ? `${(n / 1000).toFixed(1)} kN` : `${n.toFixed(0)} N`;
}

/**
 * Analitikus hajlás kétvégén befogott gerendán:
 *  - elosztott (q·L = P): δ = q·L⁴/(384·E·I) = P·L³/(384·E·I)
 *  - pontterhelés középen: δ = P·L³/(192·E·I)
 * I = t·H³/12
 */
export function fixedFixedAnalyticalDeflection(
  P: number,
  L: number,
  H: number,
  thickness: number,
  E: number,
  loadType: 'point' | 'distributed' = 'distributed',
): number {
  const I = (thickness * H * H * H) / 12;
  return loadType === 'point'
    ? (P * L * L * L) / (192 * E * I)
    : (P * L * L * L) / (384 * E * I);
}
