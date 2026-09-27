/**
 * Teljes megoldási pipeline: háló → K·u = f → elmozdulás → feszültség.
 *
 * Peremfeltételek: a rögzített szabadsági fokokat ELIMINÁLJUK a rendszerből
 * (K_ff·u_f = f_f), így a maradó mátrix SPD marad és a CG jól konvergál.
 * u_c = 0, ezért a csatolt tagok (K_fc) nem játszanak szerepet.
 */

import { assemble, collectFixedDofs } from './assemble';
import {
  constitutiveMatrix,
  elementGeometry,
  elementNodes,
  elementStress,
  vonMises,
} from './cst';
import { conjugateGradient, SparseMatrix } from './linalg';
import type { ElementStress, Mesh, SolutionResult, Vec2 } from './types';

/**
 * Kibocsátja a rögzített DOF-okat: csak a szabad DOF-okra épít
 * K_ff al mátrixot és f_f vektort.
 */
function partition(
  K: SparseMatrix,
  f: Float64Array,
  fixedDofs: number[],
): { Kff: SparseMatrix; ff: Float64Array; freeDofs: number[] } {
  const fixed = new Set(fixedDofs);
  const freeDofs: number[] = [];
  for (let i = 0; i < K.n; i++) {
    if (!fixed.has(i)) freeDofs.push(i);
  }
  const newIndex = new Map<number, number>();
  freeDofs.forEach((dof, idx) => newIndex.set(dof, idx));

  const triplets: Array<[number, number, number]> = [];
  for (let i = 0; i < K.n; i++) {
    if (fixed.has(i)) continue;
    for (let k = K.rowPtr[i]!; k < K.rowPtr[i + 1]!; k++) {
      const j = K.colIdx[k]!;
      if (!fixed.has(j)) {
        triplets.push([newIndex.get(i)!, newIndex.get(j)!, K.values[k]!]);
      }
    }
  }
  const ff = new Float64Array(freeDofs.length);
  freeDofs.forEach((dof, idx) => {
    ff[idx] = f[dof]!;
  });
  return { Kff: SparseMatrix.fromCOO(freeDofs.length, triplets), ff, freeDofs };
}

/**
 * Megoldja a hálót és kiszámítja az elemi feszültségeket.
 */
export function solve(mesh: Mesh, tol = 1e-10): SolutionResult {
  const { K, f } = assemble(mesh);
  const fixedDofs = collectFixedDofs(mesh);
  const { Kff, ff, freeDofs } = partition(K, f, fixedDofs);

  const cg = conjugateGradient(Kff, ff, { tol, maxIter: Math.min(Kff.n, 100000) });

  // Elmozdulások vissza-
  const uFull = new Float64Array(K.n);
  freeDofs.forEach((dof, idx) => {
    uFull[dof] = cg.x[idx]!;
  });

  const displacements = new Map<number, Vec2>();
  let maxDisplacement = 0;
  for (let i = 0; i < mesh.nodes.length; i++) {
    const ux = uFull[2 * i]!;
    const uy = uFull[2 * i + 1]!;
    displacements.set(i, { x: ux, y: uy });
    const mag = Math.hypot(ux, uy);
    if (mag > maxDisplacement) maxDisplacement = mag;
  }

  // Elemi feszültségek: σ = D·B·uₑ
  const stresses = new Map<number, ElementStress>();
  const D = constitutiveMatrix(mesh.material, mesh.type);
  let maxVonMises = 0;

  for (const elem of mesh.elements) {
    const [p1, p2, p3] = elementNodes(mesh.nodes, elem);
    const g = elementGeometry(p1, p2, p3);
    const uElem = [
      uFull[2 * elem.nodes[0]!]!,
      uFull[2 * elem.nodes[0]! + 1]!,
      uFull[2 * elem.nodes[1]!]!,
      uFull[2 * elem.nodes[1]! + 1]!,
      uFull[2 * elem.nodes[2]!]!,
      uFull[2 * elem.nodes[2]! + 1]!,
    ];
    const { sigmaX, sigmaY, tauXY } = elementStress(g, D, uElem);
    const vm = vonMises(sigmaX, sigmaY, tauXY);
    stresses.set(elem.id, { sigmaX, sigmaY, tauXY, vonMises: vm });
    if (vm > maxVonMises) maxVonMises = vm;
  }

  return {
    displacements,
    stresses,
    maxDisplacement,
    maxVonMises,
    iterations: cg.iterations,
    residual: cg.residual,
  };
}
