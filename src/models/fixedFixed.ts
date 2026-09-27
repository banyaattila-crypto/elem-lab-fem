/**
 * 7. modell: Kétvégén befogott gerenda
 * Mindkét végén befogadva, felső élén elosztott terheléssel.
 * Klasszikus validációs eset:
 *   δ_mid = q·L⁴ / (384·E·I) = P·L³ / (384·E·I)  (q·L = P)
 *
 * Összehasonlítás az egyszerűen tartottal: a befogások miatt
 * a hajlás 5× kisebb — a nyomatékviselés megoszlik a mezők között.
 */

import type { Mesh } from '../fem/types';
import { MATERIALS, structuredGrid, type MaterialKey } from './meshgen';

export interface FixedFixedOptions {
  /** Gerenda fesztávja [m] */
  L?: number;
  /** Gerenda magassága [m] */
  H?: number;
  /** Lemezvastagság [m] */
  thickness?: number;
  material?: MaterialKey;
  /** Összes elosztott terhelés [N] (q·L) */
  loadN?: number;
  /** Háló finomság (1 = durva, 5 = finom) */
  density?: number;
}

export function buildFixedFixed(opts: FixedFixedOptions = {}): Mesh {
  const L = opts.L ?? 4;
  const H = opts.H ?? 0.4;
  const thickness = opts.thickness ?? 0.02;
  const material = MATERIALS[opts.material ?? 'steel'];
  const loadN = opts.loadN ?? 2000;
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

  const qy = -loadN / L; // N/m
  const distributed = [{ x1: 0, y1: H, x2: L, y2: H, qy }];

  return {
    nodes: grid.nodes,
    elements: grid.elements,
    material: { ...material },
    thickness,
    bc: { fixed, loads: {}, distributed },
    type: 'plane-stress',
    annotation: {
      geom: `Kétvégén befogott gerenda · L = ${fmtLen(L)}`,
      section: `Keresztmetszet: t×H = ${(thickness * 1000).toFixed(0)}×${(H * 1000).toFixed(0)} mm`,
      statics: `Statika: 2× befogás + q = ${fmtForce(Math.abs(qy))}/m elosztott`,
      supports: [
        { x: 0, y: 0, kind: 'fixed' as const, dir: 'left' as const },
        { x: 0, y: H, kind: 'fixed' as const, dir: 'left' as const },
        { x: L, y: 0, kind: 'fixed' as const, dir: 'right' as const },
        { x: L, y: H, kind: 'fixed' as const, dir: 'right' as const },
      ],
      distLoads: [{ x1: 0, y1: H, x2: L, y2: H, qy }],
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

/**
 * Analitikus hajlás kétvégén befogott gerendán, egyenletes q mellett:
 *   δ_mid = q·L⁴/(384·E·I), q = P/L → δ = P·L³/(384·E·I); I = t·H³/12
 */
export function fixedFixedAnalyticalDeflection(
  P: number,
  L: number,
  H: number,
  thickness: number,
  E: number,
): number {
  const I = (thickness * H * H * H) / 12;
  return (P * L * L * L) / (384 * E * I);
}
