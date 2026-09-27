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
  /** Terhelő erő a szabad végén [N] */
  loadN?: number;
  /** Háló finomság (1 = durva, 5 = finom) */
  density?: number;
}

export function buildCantilever(opts: CantileverOptions = {}): Mesh {
  const L = opts.L ?? 2;
  const H = opts.H ?? 0.4;
  const thickness = opts.thickness ?? 0.02;
  const material = MATERIALS[opts.material ?? 'steel'];
  const loadN = opts.loadN ?? 1000;
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

  const loads: Record<number, Vec2> = {
    [loadNode]: { x: 0, y: -loadN },
  };

  return {
    nodes: grid.nodes,
    elements: grid.elements,
    material: { ...material },
    thickness,
    bc: { fixed, loads },
    type: 'plane-stress',
  };
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
