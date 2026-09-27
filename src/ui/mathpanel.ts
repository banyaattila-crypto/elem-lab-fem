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
import {
  t6Geometry,
  t6BMatrix,
  t6Stiffness,
  t6Stress,
  T6_GAUSS,
} from '../fem/t6';
import type { Mesh, Node, SolutionResult } from '../fem/types';

/** Egy Gauss-pont adatai (csak T6 elemeknél) */
export interface GaussPointData {
  l1: number;
  l2: number;
  w: number;
  detJ: number;
  B: number[][];
}

/** Egy elemvizsgálat összes közbülső és végeredménye */
export interface ElementInspection {
  elemId: number;
  elementType: 'CST' | 'T6';
  coords: Array<{ id: number; x: number; y: number }>;
  /** csúszóint-koordináták: b1,c1,b2,c2,b3,c3 (T6-nál a sarok-háromszögre) */
  b: [number, number, number, number, number, number];
  area: number;
  D: number[][];
  /**
   * CST: az elem állandó B mátrixa.
   * T6: a Gauss-pontok súlyozott átlaga B̄ = Σ w·detJ·B / Σ w·detJ — a B nem
   * állandó, ezért nincs egyetlen „elem-B"; az átlag az, amivel az ε = B·uₑ
   * azonosság is pontosan teljesül (az ε lineáris uₑ-ben).
   */
  B: number[][];
  ke: number[][];
  uElem: number[];
  eps: [number, number, number];
  sigma: [number, number, number];
  vonMises: number;
  material: { name: string; E: number; nu: number };
  thickness: number;
  type: 'plane-stress' | 'plane-strain';
  /** T6: a hat csúcs természetes (területi) koordinátája. CST-nál nincs. */
  natural?: Array<{ l1: number; l2: number; l3: number }>;
  /** T6: a három Gauss-pont adatai. CST-nál nincs. */
  gauss?: GaussPointData[];
}

/** A T6 hat csúcsának természetes koordinátái (L1+L2+L3 = 1) */
const T6_NATURAL: Array<{ l1: number; l2: number; l3: number }> = [
  { l1: 1, l2: 0, l3: 0 },
  { l1: 0, l2: 1, l3: 0 },
  { l1: 0, l2: 0, l3: 1 },
  { l1: 0.5, l2: 0.5, l3: 0 },
  { l1: 0, l2: 0.5, l3: 0.5 },
  { l1: 0.5, l2: 0, l3: 0.5 },
];

/** B mátrix súlyozott átlaga a Gauss-pontokból: Σ w·detJ·B / Σ w·detJ */
function averageB(gauss: GaussPointData[]): { B: number[][]; wSum: number } {
  let wSum = 0;
  for (const g of gauss) wSum += g.w * g.detJ;
  const B = Array.from({ length: 3 }, () => new Array<number>(gauss[0]!.B[0]!.length).fill(0));
  for (const g of gauss) {
    const w = g.w * g.detJ;
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < B[i]!.length; j++) B[i]![j]! += w * g.B[i]![j]!;
    }
  }
  for (let i = 0; i < 3; i++) for (let j = 0; j < B[i]!.length; j++) B[i]![j]! /= wSum;
  return { B, wSum };
}

/** ε = B·uₑ (3 vektorosra tranzspozicionált) */
function strainOf(B: number[][], uElem: number[]): [number, number, number] {
  const eps: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < B[i]!.length; j++) eps[i]! += B[i]![j]! * uElem[j]!;
  }
  return eps;
}

/**
 * Kiszámítja egy elem teljes vizsgálati csomagját az aktuális
 * háló + megoldás alapján. Az elemtípust a háló dönti el:
 * 3 csúcs → CST, 6 csúcs → T6 (a `t6convert` így konform hálót ad).
 */
export function inspectElement(
  mesh: Mesh,
  sol: SolutionResult,
  elemId: number,
): ElementInspection {
  const elem = mesh.elements.find((e) => e.id === elemId);
  if (!elem) throw new Error(`Ismeretlen elem-id: ${elemId}`);

  const D = constitutiveMatrix(mesh.material, mesh.type);
  const material = { name: mesh.material.name, E: mesh.material.E, nu: mesh.material.nu };
  const isT6 = elem.nodes.length === 6;

  if (isT6) {
    // ————— T6 kvadratikus elem —————
    const pts = elem.nodes.map((n) => mesh.nodes[n]!) as [Node, Node, Node, Node, Node, Node];
    const g = t6Geometry(pts);
    const gauss: GaussPointData[] = T6_GAUSS.map((gp) => {
      const { B, detJ } = t6BMatrix(g, gp.l1, gp.l2);
      return { l1: gp.l1, l2: gp.l2, w: gp.w, detJ, B };
    });
    const { B } = averageB(gauss);
    const ke = t6Stiffness(g, D, mesh.thickness);
    const uElem = pts.flatMap((p) => [sol.displacements.get(p.id)!.x, sol.displacements.get(p.id)!.y]);

    // Az átlagos B-vel számított ε pontosan egyezik a t6Stress Gauss-átlagával
    const eps = strainOf(B, uElem);
    const avg = t6Stress(g, D, uElem);
    const sigma: [number, number, number] = [avg.sigmaX, avg.sigmaY, avg.tauXY];
    const cg = elementGeometry(pts[0], pts[1], pts[2]);

    return {
      elemId,
      elementType: 'T6',
      coords: pts,
      b: [...cg.b] as ElementInspection['b'],
      area: cg.area,
      D,
      B,
      ke,
      uElem,
      eps,
      sigma,
      vonMises: vonMises(sigma[0], sigma[1], sigma[2]),
      material,
      thickness: mesh.thickness,
      type: mesh.type,
      natural: T6_NATURAL,
      gauss,
    };
  }

  // ————— CST —————
  const n1 = elem.nodes[0]!;
  const n2 = elem.nodes[1]!;
  const n3 = elem.nodes[2]!;
  const p1 = mesh.nodes[n1]!;
  const p2 = mesh.nodes[n2]!;
  const p3 = mesh.nodes[n3]!;

  const g: ElementGeometry = elementGeometry(p1, p2, p3);
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

  return {
    elemId,
    elementType: 'CST',
    coords: [p1, p2, p3],
    b: [...g.b] as ElementInspection['b'],
    area: g.area,
    D,
    B,
    ke,
    uElem,
    eps: strainOf(B, uElem),
    sigma: [sigmaX, sigmaY, tauXY],
    vonMises: vonMises(sigmaX, sigmaY, tauXY),
    material,
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
