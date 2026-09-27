/**
 * 2. modell: Rácsos híd (Warren-tartó)
 * Alsó öv középső csomópontjain terhelve. A rácsos szerkezetet egy
 * „szalag" hálóval modellezzük CST háromszögekből.
 */

import type { Mesh, Vec2 } from '../fem/types';
import { MATERIALS, structuredGrid, type MaterialKey } from './meshgen';

export interface TrussBridgeOptions {
  /** Híd fesztávja [m] */
  span?: number;
  /** Tartó magassága [m] */
  height?: number;
  /** Mezők száma (panelek) */
  panels?: number;
  /** Lemezvastagság [m] */
  thickness?: number;
  material?: MaterialKey;
  /** Összes terhelő erő [N] */
  loadN?: number;
}

export function buildTrussBridge(opts: TrussBridgeOptions = {}): Mesh {
  const span = opts.span ?? 8;
  const height = opts.height ?? 1.2;
  const panels = opts.panels ?? 8;
  const thickness = opts.thickness ?? 0.01;
  const material = MATERIALS[opts.material ?? 'steel'];
  const loadN = opts.loadN ?? 5000;

  // Szalagháló: fesztáv × magasság, a mezők arányában
  const nx = panels * 2;
  const ny = 2;
  const grid = structuredGrid(span, height, nx, ny);

  // Mindkét végén az alsó öv rögzített (csapágyazás) — bal vég: mindkét DOF,
  // jobb vég: csak vízszintes szabad (görgő). Az egyszerűség kedvéért mindkét
  // vég alsó csomópontját rögzítjük (statikailag határozott tartó).
  const fixed: number[] = [];
  const bottomMidNodes: number[] = [];

  for (const n of grid.nodes) {
    const atLeftEnd = Math.abs(n.x) < 1e-9;
    const atRightEnd = Math.abs(n.x - span) < 1e-9;
    const atBottom = Math.abs(n.y) < 1e-9;
    if (atBottom && (atLeftEnd || atRightEnd)) {
      fixed.push(n.id);
    }
    // alsó öv belső csomópontjai a terheléshez
    if (atBottom && !atLeftEnd && !atRightEnd) {
      bottomMidNodes.push(n.id);
    }
  }

  // Az erőt a középső alsó csomópontra helyezzük (legközelebbi a fesztáv közepéhez)
  const midX = span / 2;
  let loadNode = bottomMidNodes[0]!;
  let bestDist = Infinity;
  for (const nid of bottomMidNodes) {
    const node = grid.nodes.find((n) => n.id === nid)!;
    const dist = Math.abs(node.x - midX);
    if (dist < bestDist) {
      bestDist = dist;
      loadNode = nid;
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
    annotation: {
      geom: `Rácsos híd (Warren) · L = ${fmtLen(span)} · ${panels} mező`,
      section: `Öv-keresztmetszet: t×h = ${(thickness * 1000).toFixed(0)}×${(height / 2.4 * 1000).toFixed(0)} mm`,
    },
  };
}

/** Rövid hossz-formázó a metaadatokhoz */
function fmtLen(m: number): string {
  return m >= 1 ? `${m.toFixed(2)} m` : `${(m * 1000).toFixed(0)} mm`;
}
