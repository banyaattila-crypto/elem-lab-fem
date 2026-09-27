/**
 * 8. modell: Konzolos tartó (corbel)
 * Függőleges tartó a falból, felső végén lebegő gerendavéggel,
 * a gerendavég terhelve. Gépészeti beton-konzol/ konzol-csapágy példa:
 * a terhelés hajlítás + nyírás kombinációja a tartó szárán.
 *
 * Geometria: L-alakú szalagháló — függőleges szár a falból,
 * vízszintes kar a tetején, a kar végén lefelé mutató erő.
 */

import type { Element, Mesh, Node, Vec2 } from '../fem/types';
import { MATERIALS, compactNodes, structuredGrid, type MaterialKey } from './meshgen';

export interface CorbelOptions {
  /** Szár magassága [m] */
  stemH?: number;
  /** Szár szélessége [m] */
  stemW?: number;
  /** Kar hossza [m] */
  armL?: number;
  /** Kar magassága [m] */
  armH?: number;
  /** Lemezvastagság [m] */
  thickness?: number;
  material?: MaterialKey;
  /** Terhelő erő a kar végén [N] */
  loadN?: number;
  /** Háló finomság (1 = durva, 5 = finom) */
  density?: number;
}

export function buildCorbel(opts: CorbelOptions = {}): Mesh {
  const stemH = opts.stemH ?? 2;
  const stemW = opts.stemW ?? 0.3;
  const armL = opts.armL ?? 1.2;
  const armH = opts.armH ?? 0.3;
  const thickness = opts.thickness ?? 0.02;
  const material = MATERIALS[opts.material ?? 'steel'];
  const loadN = opts.loadN ?? 1500;
  const density = opts.density ?? 3;

  const nodes: Node[] = [];
  const elements: Element[] = [];
  let nextId = 0;

  function addGrid(x0: number, y0: number, w: number, h: number, nx: number, ny: number): void {
    const idOffset = nextId;
    const local = structuredGrid(w, h, nx, ny);
    for (const n of local.nodes) {
      nodes.push({ id: nextId++, x: x0 + n.x, y: y0 + n.y });
    }
    for (const e of local.elements) {
      elements.push({
        id: elements.length,
        nodes: e.nodes.map((k) => k + idOffset) as [number, number, number],
      });
    }
  }

  const stemNx = Math.max(2, Math.round(3 * density));
  const stemNy = Math.max(6, Math.round(20 * density));
  const armNx = Math.max(6, Math.round(12 * density));
  const armNy = Math.max(2, Math.round(3 * density));

  addGrid(0, 0, stemW, stemH, stemNx, stemNy); // függőleges szár
  addGrid(stemW - stemW, stemH, armL + stemW, armH, armNx, armNy); // vízszintes kar

  // Csomópont-összeillesztés (azonos koordináta = ugyanaz a csomópont)
  const key = (x: number, y: number): string => `${x.toFixed(6)},${y.toFixed(6)}`;
  const remap = new Map<string, number>();
  const merged: Node[] = [];
  const nodeMap = new Map<number, number>();
  for (const n of nodes) {
    const k = key(n.x, n.y);
    const existing = remap.get(k);
    if (existing !== undefined) {
      nodeMap.set(n.id, existing);
    } else {
      const newId = merged.length;
      merged.push({ id: newId, x: n.x, y: n.y });
      remap.set(k, newId);
      nodeMap.set(n.id, newId);
    }
  }
  const mergedElements: Element[] = elements.map((e) => ({
    id: e.id,
    nodes: e.nodes.map((k) => nodeMap.get(k)!) as [number, number, number],
  }));

  const { nodes: finalNodes, elements: finalElements } = compactNodes(merged, mergedElements);

  // Peremfeltételek: a szár ALJA befogadva (fal), terhelés a kar VÉGÉN
  const fixed: number[] = [];
  let loadNode = -1;
  let bestDist = Infinity;
  for (const n of finalNodes) {
    const atBottom = Math.abs(n.y) < 1e-9;
    const atStem = n.x <= stemW + 1e-9;
    if (atBottom && atStem) fixed.push(n.id);

    const dist = Math.hypot(n.x - (armL + stemW), n.y - (stemH + armH));
    if (dist < bestDist) {
      bestDist = dist;
      loadNode = n.id;
    }
  }

  const loads: Record<number, Vec2> = {
    [loadNode]: { x: 0, y: -loadN },
  };

  return {
    nodes: finalNodes,
    elements: finalElements,
    material: { ...material },
    thickness,
    bc: { fixed, loads },
    type: 'plane-stress',
    annotation: {
      geom: `Konzolos tartó · szár h = ${fmtLen(stemH)} · kar L = ${fmtLen(armL)}`,
      section: `Szár: ${fmtLen(stemW)}×${fmtLen(stemH)} · kar: ${fmtLen(armL + stemW)}×${fmtLen(armH)}`,
      statics: `Statika: falba befogott szár + ${fmtForce(loadN)} a kar végén`,
      supports: [
        { x: 0, y: 0, kind: 'fixed' as const, dir: 'left' as const },
        { x: stemW, y: 0, kind: 'fixed' as const, dir: 'left' as const },
      ],
      pointLoads: [
        { x: armL + stemW, y: stemH + armH, fx: 0, fy: -loadN, label: fmtForce(loadN) },
      ],
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
