/**
 * 4. modell: Egyszerűen tartott gerenda (csukló + görgő)
 * Alsó két sarkán támaszva, középen terhelve. Klasszikus validációs eset:
 *   δ_mid = P·L³ / (48·E·I)
 *
 * A bal alsó sarok csukló (mindkét DOF rögzített), a jobb alsó sarok görgő
 * (csak Y rögzített → a vízszintes duzzadás/zsugorodás szabad).
 * Az anyag-modell szempontjából a gerenda téglalap keresztmetszetű,
 * mélysége = vastagság (t) — sík-feszültségállapotú lemezként modellezve.
 */

import type { Mesh, Vec2 } from '../fem/types';
import { MATERIALS, structuredGrid, type MaterialKey } from './meshgen';

export interface SimplySupportedOptions {
  /** Gerenda fesztávja [m] */
  L?: number;
  /** Gerenda magassága [m] */
  H?: number;
  /** Lemezvastagság [m] */
  thickness?: number;
  material?: MaterialKey;
  /** Terhelő erő a középpontban [N] */
  loadN?: number;
  /** Háló finomság (1 = durva, 5 = finom) */
  density?: number;
}

export function buildSimplySupported(opts: SimplySupportedOptions = {}): Mesh {
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
  const rollerY: number[] = [];
  let loadNode = -1;
  let loadNodeDist = Infinity;

  for (const n of grid.nodes) {
    const atLeft = Math.abs(n.x) < 1e-9;
    const atRight = Math.abs(n.x - L) < 1e-9;
    const atBottom = Math.abs(n.y) < 1e-9;

    if (atBottom && atLeft) fixed.push(n.id);
    if (atBottom && atRight) rollerY.push(n.id);

    if (atTop(n)) {
      const dist = Math.abs(n.x - L / 2);
      if (dist < loadNodeDist) {
        loadNodeDist = dist;
        loadNode = n.id;
      }
    }
  }

  function atTop(n: { x: number; y: number }): boolean {
    return Math.abs(n.y - H) < 1e-9;
  }

  const loads: Record<number, Vec2> = {
    [loadNode]: { x: 0, y: -loadN },
  };

  return {
    nodes: grid.nodes,
    elements: grid.elements,
    material: { ...material },
    thickness,
    bc: { fixed, rollerY, loads },
    type: 'plane-stress',
    annotation: {
      geom: `Egyszerűen tartott gerenda · L = ${fmtLen(L)}`,
      section: `Keresztmetszet: t×H = ${(thickness * 1000).toFixed(0)}×${(H * 1000).toFixed(0)} mm`,
    },
  };
}

/** Rövid hossz-formázó a metaadatokhoz */
function fmtLen(m: number): string {
  return m >= 1 ? `${m.toFixed(2)} m` : `${(m * 1000).toFixed(0)} mm`;
}

/** Analitikus hajlás középterhelésre: δ = P·L³/(48·E·I), I = t·H³/12 */
export function simplySupportedAnalyticalDeflection(
  P: number,
  L: number,
  H: number,
  thickness: number,
  E: number,
): number {
  const I = (thickness * H * H * H) / 12;
  return (P * L * L * L) / (48 * E * I);
}
