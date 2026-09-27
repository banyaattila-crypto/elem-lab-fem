/**
 * 5. modell: Portálkeret (keretes tartó)
 * Két oszlop + födémgerenda, sarkainál merev csomó. Oszlop-alj befogadott,
 * a gerenda közepén terhelve. A keretet „szalag" hálóval modellezzük:
 * a két oszlop és a gerenda egybefüggő, L-alakú sarkokkal illesztett
 * strukturált rács — a sarokcsomók átfordítják a hajlítónyomatéket.
 *
 * Geometria:
 *   - bal oszlop: [0, colW] × [0, colH]
 *   - jobb oszlop: [span-colW, span] × [0, colH]
 *   - gerenda: [0, span] × [colH, colH + beamH]
 * A sarok átfedést a csomópont-összeillesztés (azonos koordináta = ugyanaz
 * a csomópont) automatikusan kezeli.
 */

import type { Element, Mesh, Node, Vec2 } from '../fem/types';
import { MATERIALS, compactNodes, structuredGrid, type MaterialKey } from './meshgen';

export interface PortalFrameOptions {
  /** Fesztáv (oszlopok tengelytávja) [m] */
  span?: number;
  /** Oszlop magassága [m] */
  colH?: number;
  /** Oszlop szélessége [m] */
  colW?: number;
  /** Gerenda magassága [m] */
  beamH?: number;
  /** Lemezvastagság [m] */
  thickness?: number;
  material?: MaterialKey;
  /** Terhelő erő a gerenda közepén [N] */
  loadN?: number;
  /** Háló finomság (1 = durva, 5 = finom) */
  density?: number;
}

export function buildPortalFrame(opts: PortalFrameOptions = {}): Mesh {
  const span = opts.span ?? 4;
  const colH = opts.colH ?? 2;
  const colW = opts.colW ?? 0.25;
  const beamH = opts.beamH ?? 0.35;
  const thickness = opts.thickness ?? 0.02;
  const material = MATERIALS[opts.material ?? 'steel'];
  const loadN = opts.loadN ?? 2000;
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
      elements.push({ id: elements.length, nodes: e.nodes.map((k) => k + idOffset) as [number, number, number] });
    }
  }

  // Hálófelbontás: jellemző elemszélesség ~ a gerenda/oszlop arányhoz igazítva
  const colNx = Math.max(1, Math.round(2 * density));
  const colNy = Math.max(3, Math.round(16 * density * (colH / span) * 2));
  const beamNx = Math.max(6, Math.round(16 * density));
  const beamNy = Math.max(2, Math.round(2 * density));

  addGrid(0, 0, colW, colH, colNx, colNy); // bal oszlop
  addGrid(span - colW, 0, colW, colH, colNx, colNy); // jobb oszlop
  addGrid(0, colH, span, beamH, beamNx, beamNy); // gerenda

  // Csomópont-összeillesztés: azonos koordináta → ugyanaz a csomópont
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

  // Peremfeltételek: mindkét oszlop alja befogadva, gerenda közepe terhelve
  const fixed: number[] = [];
  const loads: Record<number, Vec2> = {};

  let loadNode = -1;
  let bestDist = Infinity;
  for (const n of finalNodes) {
    const atBottom = Math.abs(n.y) < 1e-9;
    const atColumn = n.x < colW + 1e-9 || n.x > span - colW - 1e-9;
    if (atBottom && atColumn) fixed.push(n.id);

    const dist = Math.hypot(n.x - span / 2, n.y - (colH + beamH));
    if (dist < bestDist) {
      bestDist = dist;
      loadNode = n.id;
    }
  }
  loads[loadNode] = { x: 0, y: -loadN };

  return {
    nodes: finalNodes,
    elements: finalElements,
    material: { ...material },
    thickness,
    bc: { fixed, loads },
    type: 'plane-stress',
    annotation: {
      geom: `Portálkeret · L = ${fmtLen(span)} · oszlop h = ${fmtLen(colH)}`,
      section: `Oszlop: ${fmtLen(colW)}×${fmtLen(colH)} · gerenda: ${fmtLen(span)}×${fmtLen(beamH)}`,
      statics: `Statika: 2× befogás + ${fmtForce(loadN)} a gerenda közepén`,
      supports: [
        { x: 0, y: 0, kind: 'fixed' as const, dir: 'left' as const },
        { x: span, y: 0, kind: 'fixed' as const, dir: 'right' as const },
      ],
      pointLoads: [
        { x: span / 2, y: colH + beamH, fx: 0, fy: -loadN, label: fmtForce(loadN) },
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
