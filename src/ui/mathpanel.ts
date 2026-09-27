/**
 * MathPanel — adatréteg: a kiválasztott elem teljes vizsgálata.
 * Ugyanazokat a függvényeket hívja, mint a szolver → a panel
 * mindig a valós, aktuális számításokat mutatja.
 */

import {
  elementGeometry,
  strainMatrix,
  constitutiveMatrix,
  elementStiffness,
  elementStress,
  vonMises,
  type ElementGeometry,
} from '../fem/cst';
import type { Mesh, SolutionResult } from '../fem/types';

/** Egy elemvizsgálat összes közbülső és végeredménye */
export interface ElementInspection {
  elemId: number;
  coords: Array<{ id: number; x: number; y: number }>;
  /** csúszóint-koordináták: b1,c1,b2,c2,b3,c3 */
  b: [number, number, number, number, number, number];
  area: number;
  D: number[][];
  B: number[][];
  ke: number[][];
  uElem: number[];
  eps: [number, number, number];
  sigma: [number, number, number];
  vonMises: number;
  material: { name: string; E: number; nu: number };
  thickness: number;
  type: 'plane-stress' | 'plane-strain';
}

/**
 * Kiszámítja egy elem teljes vizsgálati csomagját az aktuális
 * háló + megoldás alapján.
 */
export function inspectElement(
  mesh: Mesh,
  sol: SolutionResult,
  elemId: number,
): ElementInspection {
  const elem = mesh.elements.find((e) => e.id === elemId);
  if (!elem) throw new Error(`Ismeretlen elem-id: ${elemId}`);

  const n1 = elem.nodes[0]!;
  const n2 = elem.nodes[1]!;
  const n3 = elem.nodes[2]!;
  const p1 = mesh.nodes[n1]!;
  const p2 = mesh.nodes[n2]!;
  const p3 = mesh.nodes[n3]!;

  const g: ElementGeometry = elementGeometry(p1, p2, p3);
  const D = constitutiveMatrix(mesh.material, mesh.type);
  const B = strainMatrix(g);
  const ke = elementStiffness(g, D, mesh.thickness);

  const uElem = [
    sol.displacements.get(n1)!.x,
    sol.displacements.get(n1)!.y,
    sol.displacements.get(n2)!.x,
    sol.displacements.get(n2)!.y,
    sol.displacements.get(n3)!.x,
    sol.displacements.get(n3)!.y,
  ];

  const { sigmaX, sigmaY, tauXY } = elementStress(g, D, uElem);
  const vm = vonMises(sigmaX, sigmaY, tauXY);

  // ε = B·u (ugyanazzal a képlettel, mint elementStress belső része)
  let e0 = 0;
  let e1 = 0;
  let e2 = 0;
  for (let j = 0; j < 6; j++) {
    e0 += B[0]![j]! * uElem[j]!;
    e1 += B[1]![j]! * uElem[j]!;
    e2 += B[2]![j]! * uElem[j]!;
  }

  return {
    elemId,
    coords: [p1, p2, p3],
    b: [...g.b] as ElementInspection['b'],
    area: g.area,
    D,
    B,
    ke,
    uElem,
    eps: [e0, e1, e2],
    sigma: [sigmaX, sigmaY, tauXY],
    vonMises: vm,
    material: { name: mesh.material.name, E: mesh.material.E, nu: mesh.material.nu },
    thickness: mesh.thickness,
    type: mesh.type,
  };
}

/** Mérnöki formázók */
export const fmt = {
  m: (v: number): string => {
    const a = Math.abs(v);
    if (a < 1e-12) return '0';
    if (a >= 1) return `${v.toFixed(3)} m`;
    if (a >= 1e-3) return `${(v * 1e3).toFixed(2)} mm`;
    return `${(v * 1e6).toFixed(1)} µm`;
  },
  pa: (v: number): string => {
    const a = Math.abs(v);
    if (a < 1e-12) return '0';
    if (a >= 1e9) return `${(v / 1e9).toFixed(2)} GPa`;
    if (a >= 1e6) return `${(v / 1e6).toFixed(3)} MPa`;
    if (a >= 1e3) return `${(v / 1e3).toFixed(1)} kPa`;
    return `${v.toFixed(1)} Pa`;
  },
  area: (v: number): string => {
    const a = Math.abs(v);
    if (a >= 1e-3) return `${v.toFixed(4)} m²`;
    if (a >= 1e-6) return `${(v * 1e4).toFixed(2)} cm²`;
    return `${(v * 1e6).toFixed(2)} mm²`;
  },
  n: (v: number): string => {
    const a = Math.abs(v);
    if (a < 1e-12) return '0';
    if (a >= 1e6) return `${(v / 1e6).toFixed(3)} MN`;
    if (a >= 1e3) return `${(v / 1e3).toFixed(2)} kN`;
    return `${v.toFixed(1)} N`;
  },
  num: (v: number, digits = 4): string => {
    if (v === 0) return '0';
    if (Math.abs(v) >= 1e5 || Math.abs(v) < 1e-4) return v.toExponential(3);
    return v.toFixed(digits);
  },
};
