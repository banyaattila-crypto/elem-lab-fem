/**
 * CST → T6 hálókonverzió.
 * Minden CST háromszögből EGY T6 lesz: a három él közepére új csomópont kerül.
 * A közös élek közép-csomópontjait él-hashing osztja meg → kompatibilis háló.
 *
 * Peremfeltételek:
 *  - rögzítés: ha egy él MINDKÉT sarok-csomópontja rögzített, az él közép-csomópontja is rögzített
 *  - terhelés: a sarok-csomópontok id-ja változatlan → a csomóponti erők érvényesek maradnak
 */

import type { Element, Mesh } from '../fem/types';

export function convertToT6(mesh: Mesh): Mesh {
  const nodes = mesh.nodes.map((n) => ({ ...n }));
  const elements: Element[] = [];
  const edgeMap = new Map<string, number>();
  let nextId = nodes.length;

  const edgeKey = (a: number, b: number): string =>
    a < b ? `${a}:${b}` : `${b}:${a}`;

  const midNode = (a: number, b: number): number => {
    const key = edgeKey(a, b);
    const existing = edgeMap.get(key);
    if (existing !== undefined) return existing;
    const na = nodes[a]!;
    const nb = nodes[b]!;
    nodes.push({ id: nextId, x: (na.x + nb.x) / 2, y: (na.y + nb.y) / 2 });
    edgeMap.set(key, nextId);
    return nextId++;
  };

  for (const e of mesh.elements) {
    const a = e.nodes[0]!;
    const b = e.nodes[1]!;
    const c = e.nodes[2]!;
    const mab = midNode(a, b);
    const mbc = midNode(b, c);
    const mca = midNode(c, a);
    // T6 sorrend: [n1, n2, n3, m12, m23, m31]
    elements.push({ id: e.id, nodes: [a, b, c, mab, mbc, mca] });
  }

  // Rögzített élek közép-csomópontjai is rögzítettek
  const fixedSet = new Set(mesh.bc.fixed);
  const fixed = [...mesh.bc.fixed];
  for (const [key, mid] of edgeMap) {
    const [a, b] = key.split(':').map(Number);
    if (fixedSet.has(a!) && fixedSet.has(b!)) {
      fixed.push(mid);
    }
  }

  return {
    nodes,
    elements,
    material: { ...mesh.material },
    thickness: mesh.thickness,
    bc: { fixed, loads: { ...mesh.bc.loads } },
    type: mesh.type,
    elementType: 'T6',
  };
}
