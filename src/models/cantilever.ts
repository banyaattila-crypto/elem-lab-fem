/**
 * 1. modell: Konzolgerenda
 * Bal oldala befogadott, jobb végén erő. Klasszikus validációs eset:
 * δ = P·L³ / (3·E·I)  (analitikus hajlás a szabad végén)
 */

import type { Mesh, Vec2 } from '../fem/types';
import { MATERIALS, structuredGrid, type MaterialKey } from './meshgen';

export interface CantileverOptions {
  /** Gerenda hossza [m] */
  L?: number;
  /** Gerenda magassága [m] */
  H?: number;
  /** Lemezvastagság [m] */
  thickness?: number;
  material?: MaterialKey;
  /** Terhelő erő a szabad végén [N] (elosztottnál a q·L összerő) */
  loadN?: number;
  /** Terhelés-típus: pontterhelés a végén vagy elosztott a felső élen */
  loadType?: 'point' | 'distributed';
  /** Háló finomság (1 = durva, 5 = finom) */
  density?: number;
}

export function buildCantilever(opts: CantileverOptions = {}): Mesh {
  const L = opts.L ?? 2;
  const H = opts.H ?? 0.4;
  const thickness = opts.thickness ?? 0.02;
  const material = MATERIALS[opts.material ?? 'steel'];
  const loadN = opts.loadN ?? 1000;
  const loadType = opts.loadType ?? 'point';
  const density = opts.density ?? 3;

  const nx = Math.max(4, Math.round(8 * density));
  const ny = Math.max(2, Math.round((nx * H) / L / 1.2));

  const grid = structuredGrid(L, H, nx, ny);

  // Peremfeltételek: bal él befogadva, jobb él középső csomópontján az erő
  const fixed: number[] = [];
  let loadNode = -1;
  let loadNodeDist = Infinity;

  for (const n of grid.nodes) {
    if (Math.abs(n.x) < 1e-9) fixed.push(n.id);
    if (Math.abs(n.x - L) < 1e-9) {
      const dist = Math.abs(n.y - H / 2);
      if (dist < loadNodeDist) {
        loadNodeDist = dist;
        loadNode = n.id;
      }
    }
  }

  const isDistributed = loadType === 'distributed';
  const qy = -loadN / L;
  const loads: Record<number, Vec2> = isDistributed
    ? {}
    : { [loadNode]: { x: 0, y: -loadN } };
  const distributed = isDistributed
    ? [{ x1: 0, y1: H, x2: L, y2: H, qy }]
    : undefined;

  return {
    nodes: grid.nodes,
    elements: grid.elements,
    material: { ...material },
    thickness,
    bc: { fixed, loads, distributed },
    type: 'plane-stress',
    annotation: {
      geom: `Konzolgerenda · L = ${fmtLen(L)}`,
      section: `Keresztmetszet: t×H = ${(thickness * 1000).toFixed(0)}×${(H * 1000).toFixed(0)} mm`,
      statics: isDistributed
        ? `Statika: befogás + q = ${fmtForce(Math.abs(qy))}/m elosztott`
        : `Statika: befogás + ${fmtForce(loadN)} pontterhelés`,
      supports: [
        { x: 0, y: 0, kind: 'fixed' as const, dir: 'left' as const },
        { x: 0, y: H, kind: 'fixed' as const, dir: 'left' as const },
      ],
      ...(isDistributed
        ? { distLoads: [{ x1: 0, y1: H, x2: L, y2: H, qy }] }
        : { pointLoads: [{ x: L, y: H / 2, fx: 0, fy: -loadN, label: fmtForce(loadN) }] }),
    },
  };
}

/** Rövid hossz-formázó a metaadatokhoz */
function fmtLen(m: number): string {
  return m >= 1 ? `${m.toFixed(2)} m` : `${(m * 1000).toFixed(0)} mm`;
}

/** Erő-formázó a sémához */
function fmtForce(n: number): string {
  return Math.abs(n) >= 1000 ? `${(n / 1000).toFixed(1)} kN` : `${n.toFixed(0)} N`;
}

/** Analitikus hajlás összehasonlításhoz: δ = P·L³/(3·E·I), I = t·H³/12 */
export function cantileverAnalyticalDeflection(
  P: number,
  L: number,
  H: number,
  thickness: number,
  E: number,
): number {
  const I = (thickness * H * H * H) / 12;
  return (P * L * L * L) / (3 * E * I);
}
