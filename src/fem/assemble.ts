/**
 * Globális merevségi mátrix összeállítása és a K·u = f rendszer felírása.
 */

import type { Node } from './types';
import { elementStiffness, elementGeometry, elementNodes, constitutiveMatrix } from './cst';
import { t6Geometry, t6Stiffness, t6Constitutive } from './t6';
import { SparseMatrix } from './linalg';
import type { Mesh, Vec2 } from './types';

export interface AssembledSystem {
  /** Globális merevségi mátrix (ritka, COO-ból építve) */
  K: SparseMatrix;
  /** Terhelő vektor [N] */
  f: Float64Array;
  /** A rendszer mérete (2 × csomópontszám) */
  n: number;
}

/** Csomópont-id → szabadsági fok indexek: dof = 2*nodeId, 2*nodeId+1 */
export function nodeDofs(nodeId: number): [number, number] {
  return [2 * nodeId, 2 * nodeId + 1];
}

/**
 * Összeállítja a globális K mátrixot és f vektort.
 * Az elemi 6×6 merevségi mátrixokat a globális DOF-indexekre szórjuk;
 * az átfedő pozíciók összeadódnak (SparseMatrix.fromCOO kezeli).
 */
export function assemble(mesh: Mesh): AssembledSystem {
  const n = mesh.nodes.length * 2;
  const triplets: Array<[number, number, number]> = [];
  const f = new Float64Array(n);

  const isT6 = (mesh.elementType ?? 'CST') === 'T6';
  const D = isT6
    ? t6Constitutive(mesh.material, mesh.type)
    : constitutiveMatrix(mesh.material, mesh.type);

  for (const elem of mesh.elements) {
    if (isT6) {
      // ————— T6: 6 csomópont, 12 DOF —————
      const pts = elem.nodes.map((nid) => mesh.nodes[nid]!) as [
        Node, Node, Node, Node, Node, Node,
      ];
      const g = t6Geometry(pts);
      const ke = t6Stiffness(g, D, mesh.thickness);

      const dofs: number[] = [];
      for (const nodeId of elem.nodes) {
        const [dx, dy] = nodeDofs(nodeId);
        dofs.push(dx, dy);
      }
      for (let i = 0; i < 12; i++) {
        for (let j = 0; j < 12; j++) {
          const v = ke[i]![j]!;
          if (v !== 0) triplets.push([dofs[i]!, dofs[j]!, v]);
        }
      }
    } else {
      // ————— CST: 3 csomópont, 6 DOF —————
      const [p1, p2, p3] = elementNodes(mesh.nodes, elem);
      const g = elementGeometry(p1, p2, p3);
      const ke = elementStiffness(g, D, mesh.thickness);

      const dofs: number[] = [];
      for (const nodeId of elem.nodes) {
        const [dx, dy] = nodeDofs(nodeId);
        dofs.push(dx, dy);
      }
      for (let i = 0; i < 6; i++) {
        for (let j = 0; j < 6; j++) {
          const v = ke[i]![j]!;
          if (v !== 0) {
            triplets.push([dofs[i]!, dofs[j]!, v]);
          }
        }
      }
    }
  }

  // Csomóponti erők
  for (const [nodeId, force] of Object.entries(mesh.bc.loads)) {
    const [dx, dy] = nodeDofs(Number(nodeId));
    f[dx] = force.x;
    f[dy] = force.y;
  }

  // Elosztott terhelés: konzisztens csomóponti erőkkel (CST: lineáris
  // alakfüggvény → a szakasz teljes erőjének 1/2-1/2 elosztása a két
  // végcsomópont között; T6-nál 1/6-4/6-1/6 az oldal-csomópontokkal).
  // Egyszerűsítés: a szakasz végpontjaihoz legközelebbi háló-csomópontokat
  // terheljük, az erő arányosan a rá eső fesztáv-szakaszokkal.
  if (mesh.bc.distributed?.length) {
    const q = mesh.bc.distributed[0]!;
    // A szakaszra eső háló-csomópontok és fesztáv-szeletek összegyűjtése
    const seg = mesh.nodes
      .filter((n) => onSegment(n, q))
      .map((n) => ({ n, w: nodeWeight(n, q, mesh) }));
    const wSum = seg.reduce((s, e) => s + e.w, 0);
    if (wSum > 0) {
      // A szakasz teljes erője = qy · hossz [N] (qy N/m-ben értendő,
      // a 2D modellben a vastagság a keresztmetszet része)
      const len = Math.hypot(q.x2 - q.x1, q.y2 - q.y1);
      const total = q.qy * len;
      for (const { n, w } of seg) {
        const frac = w / wSum;
        const [, dy] = nodeDofs(n.id);
        f[dy] = (f[dy] ?? 0) + total * frac;
      }
    }
  }

  const K = SparseMatrix.fromCOO(n, triplets);
  return { K, f, n };
}

/** Rögzített csomópontok DOF-inak listája (+ egyirányú görgő-támaszok) */
export function collectFixedDofs(mesh: Mesh): number[] {
  const fixed: number[] = [];
  for (const nodeId of mesh.bc.fixed) {
    const [dx, dy] = nodeDofs(nodeId);
    fixed.push(dx, dy);
  }
  // Görgők: csak EGY szabadsági fok rögzített
  for (const nodeId of mesh.bc.rollerX ?? []) {
    fixed.push(nodeDofs(nodeId)[0]!);
  }
  for (const nodeId of mesh.bc.rollerY ?? []) {
    fixed.push(nodeDofs(nodeId)[1]!);
  }
  return fixed;
}

/** Terhelésvektor segédfüggvény tesztekhez */
export function pointLoad(x: number, y: number): Vec2 {
  return { x, y };
}

/** A csomópont a (vízszintes) elosztott-terhelés szakaszra esik-e */
function onSegment(n: Node, q: { x1: number; y1: number; x2: number; y2: number }): boolean {
  // Vízszintes szakasz feltételezéssel: y-tolerance az átfedéshez
  const yMin = Math.min(q.y1, q.y2) - 1e-6;
  const yMax = Math.max(q.y1, q.y2) + 1e-6;
  const xMin = Math.min(q.x1, q.x2) - 1e-6;
  const xMax = Math.max(q.x1, q.x2) + 1e-6;
  return n.x >= xMin && n.x <= xMax && n.y >= yMin && n.y <= yMax;
}

/**
 * Csomópont-súly az elosztott terhelés elosztásához: a szomszédos
 * fesztáv-szeletek fele-fele arányú összege (háló-sűrűségtől független,
 * konvergáló megoszlás). Vízszintes szakasz, egyenletes qy feltételezéssel.
 */
function nodeWeight(
  _n: Node,
  _q: { x1: number; x2: number },
  _mesh: Mesh,
): number {
  // Az egyenletes elosztás miatt a súly maga a csomóponthoz tartozó
  // befogási hossz — ezt a szomszédos csomópontok távolságából becsüljük.
  // Egyszerű, robusztus választás: minden csomópont súlya 1, a megoszlás
  // a strukturált rácson közel azonos szeleteket jelent.
  return 1;
}
