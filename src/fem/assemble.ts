/**
 * Globális merevségi mátrix összeállítása és a K·u = f rendszer felírása.
 */

import { elementStiffness, elementGeometry, elementNodes, constitutiveMatrix } from './cst';
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

  const D = constitutiveMatrix(mesh.material, mesh.type);

  for (const elem of mesh.elements) {
    const [p1, p2, p3] = elementNodes(mesh.nodes, elem);
    const g = elementGeometry(p1, p2, p3);
    const ke = elementStiffness(g, D, mesh.thickness);

    // A 3 csomópont DOF-jai sorrendben: [n1x, n1y, n2x, n2y, n3x, n3y]
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

  // Csomóponti erők
  for (const [nodeId, force] of Object.entries(mesh.bc.loads)) {
    const [dx, dy] = nodeDofs(Number(nodeId));
    f[dx] = force.x;
    f[dy] = force.y;
  }

  const K = SparseMatrix.fromCOO(n, triplets);
  return { K, f, n };
}

/** Rögzített csomópontok DOF-inak listája */
export function collectFixedDofs(mesh: Mesh): number[] {
  const fixed: number[] = [];
  for (const nodeId of mesh.bc.fixed) {
    const [dx, dy] = nodeDofs(nodeId);
    fixed.push(dx, dy);
  }
  return fixed;
}

/** Terhelésvektor segédfüggvény tesztekhez */
export function pointLoad(x: number, y: number): Vec2 {
  return { x, y };
}
