/**
 * Strukturált négyszög-háló generátor és segédfüggvények.
 * A háromszögelezés: minden négyszög 2 CCW háromszögre bontva.
 */

import type { Element, Node } from '../fem/types';

export interface GridMesh {
  nodes: Node[];
  elements: Element[];
  /** node-id → (i,j) rácskoordináta */
  nx: number;
  ny: number;
}

/**
 * W×H méretű téglalap rácsos hálója.
 * node-id = j*(nx+1) + i, ahol i∈[0..nx], j∈[0..ny]
 */
export function structuredGrid(W: number, H: number, nx: number, ny: number): GridMesh {
  const nodes: Node[] = [];
  for (let j = 0; j <= ny; j++) {
    for (let i = 0; i <= nx; i++) {
      nodes.push({ id: j * (nx + 1) + i, x: (i * W) / nx, y: (j * H) / ny });
    }
  }
  const elements: Element[] = [];
  let eid = 0;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i;
      const b = j * (nx + 1) + i + 1;
      const c = (j + 1) * (nx + 1) + i + 1;
      const d = (j + 1) * (nx + 1) + i;
      // (a,b,c) és (a,c,d) — óramutatóval ellentétes körzés
      elements.push({ id: eid++, nodes: [a, b, c] });
      elements.push({ id: eid++, nodes: [a, c, d] });
    }
  }
  return { nodes, elements, nx, ny };
}

/**
 * Eltávolítja azokat a csomópontokat, amelyekre egyetlen elem sem hivatkozik,
 * és újraszámozza a maradékokat. Az új id-k a bemeneti sorrendet követik.
 */
export function compactNodes(
  nodes: Node[],
  elements: Element[],
): { nodes: Node[]; elements: Element[]; remap: Map<number, number> } {
  const used = new Set<number>();
  for (const e of elements) {
    for (const nid of e.nodes) used.add(nid);
  }
  const remap = new Map<number, number>();
  const kept: Node[] = [];
  for (const n of nodes) {
    if (used.has(n.id)) {
      remap.set(n.id, kept.length);
      kept.push({ ...n, id: kept.length });
    }
  }
  const remapped: Element[] = elements.map((e, i) => ({
    id: i,
    nodes: [
      remap.get(e.nodes[0]!)!,
      remap.get(e.nodes[1]!)!,
      remap.get(e.nodes[2]!)!,
    ] as [number, number, number],
  }));
  return { nodes: kept, elements: remapped, remap };
}

/** Háromszög területe (CCW: pozitív) */
export function triangleArea(p1: Node, p2: Node, p3: Node): number {
  return 0.5 * ((p2.x - p1.x) * (p3.y - p1.y) - (p3.x - p1.x) * (p2.y - p1.y));
}

/** CB fő anyagok — közös katalógus */
export const MATERIALS = {
  steel: { name: 'S235 acél', E: 210e9, nu: 0.3, density: 7850 },
  aluminium: { name: 'Alumínium Al6061', E: 69e9, nu: 0.33, density: 2700 },
  wood: { name: 'Fa (fenyő, a rost irányában)', E: 11e9, nu: 0.35, density: 500 },
} as const;

export type MaterialKey = keyof typeof MATERIALS;
