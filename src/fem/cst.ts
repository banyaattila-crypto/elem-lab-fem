/**
 * Konstans feszültségű háromszögelem (CST — Constant Strain Triangle).
 * Részletes képletek: docs/fem-spec.md
 *
 * Minden csomópontban 2 szabadsági fok (ux, uy), elemenként 6×6-os merevségi mátrix.
 */

import type { Element, Material, Node } from './types';

/** Egy elem geometriai leírója (a merevségi mátrixhoz szükséges mennyiségek) */
export interface ElementGeometry {
  /** Csúszóint-koordináták: b1,c1,b2,c2,b3,c3 */
  b: [number, number, number, number, number, number];
  /** Az elem területe */
  area: number;
  /** Csomópont-koordináták, hibakereséshez */
  coords: [Node, Node, Node];
}

/**
 * Kiszámítja az elem geometriai adatait.
 * A csomópont-sorrend CCW legyen (pozitív terület)!
 */
export function elementGeometry(p1: Node, p2: Node, p3: Node): ElementGeometry {
  const b1 = p2.y - p3.y;
  const c1 = p3.x - p2.x;
  const b2 = p3.y - p1.y;
  const c2 = p1.x - p3.x;
  const b3 = p1.y - p2.y;
  const c3 = p2.x - p1.x;
  // 2A = b1·c2 − b2·c1 (CCW sorrend esetén pozitív)
  const area = 0.5 * (b1 * c2 - b2 * c1);
  if (area <= 0) {
    throw new Error(
      `Az elem területe nem pozitív (${area}) — a csomópont-sorrend nem CCW.`,
    );
  }
  return {
    b: [b1, c1, b2, c2, b3, c3],
    area,
    coords: [p1, p2, p3],
  };
}

/**
 * B mátrix (alakfüggvény-deriváltak, 3×6):
 * minden sorban az x/y deriváltak a csúszóint-koordinátákkal.
 */
export function strainMatrix(g: ElementGeometry): number[][] {
  const [b1, c1, b2, c2, b3, c3] = g.b;
  const A2 = 2 * g.area;
  return [
    [b1 / A2, 0, b2 / A2, 0, b3 / A2, 0],
    [0, c1 / A2, 0, c2 / A2, 0, c3 / A2],
    [c1 / A2, b1 / A2, c2 / A2, b2 / A2, c3 / A2, b3 / A2],
  ];
}

/**
 * Anyagmátrix D (3×3) síkfeszültség- vagy síkdeformációs állapothoz.
 */
export function constitutiveMatrix(
  material: Material,
  type: 'plane-stress' | 'plane-strain',
): number[][] {
  const E = material.E;
  const nu = material.nu;

  if (type === 'plane-stress') {
    const k = E / (1 - nu * nu);
    return [
      [k, k * nu, 0],
      [k * nu, k, 0],
      [0, 0, (k * (1 - nu)) / 2],
    ];
  }
  // síkdeformáció
  const k = E / ((1 + nu) * (1 - 2 * nu));
  return [
    [k * (1 - nu), k * nu, 0],
    [k * nu, k * (1 - nu), 0],
    [0, 0, (k * (1 - 2 * nu)) / 2],
  ];
}

/** 6×6 elemi merevségi mátrix: k = t · A · Bᵀ · D · B */
export function elementStiffness(
  g: ElementGeometry,
  D: number[][],
  thickness: number,
): number[][] {
  const B = strainMatrix(g); // 3×6
  const DB = matMul(D, B); // 3×6
  const BT = transpose(B); // 6×3
  const k = matMul(BT, DB); // 6×6
  const factor = thickness * g.area;
  return k.map((row) => row.map((v) => v * factor));
}

/**
 * Elemi feszültség: σ = D · B · uₑ (uₑ a 6-komponensű csomóponti elmozdulás-vektor).
 */
export function elementStress(
  g: ElementGeometry,
  D: number[][],
  uElem: number[],
): { sigmaX: number; sigmaY: number; tauXY: number } {
  const B = strainMatrix(g);
  // strain = B · u  →  [εx, εy, γxy]
  let e0 = 0;
  let e1 = 0;
  let e2 = 0;
  for (let j = 0; j < 6; j++) {
    e0 += B[0]![j]! * uElem[j]!;
    e1 += B[1]![j]! * uElem[j]!;
    e2 += B[2]![j]! * uElem[j]!;
  }
  const eps = [e0, e1, e2];
  // stress = D · ε
  let s0 = 0;
  let s1 = 0;
  let s2 = 0;
  for (let j = 0; j < 3; j++) {
    s0 += D[0]![j]! * eps[j]!;
    s1 += D[1]![j]! * eps[j]!;
    s2 += D[2]![j]! * eps[j]!;
  }
  return { sigmaX: s0, sigmaY: s1, tauXY: s2 };
}

/** Von Mises összehasonlító feszültség síkbeli feszültségállapotból */
export function vonMises(sigmaX: number, sigmaY: number, tauXY: number): number {
  return Math.sqrt(
    sigmaX * sigmaX + sigmaY * sigmaY - sigmaX * sigmaY + 3 * tauXY * tauXY,
  );
}

// ————— kis mátrix-segédfüggvények —————

/** Mátrix transzponálása: A (m×n) → Aᵀ (n×m) */
function transpose(A: number[][]): number[][] {
  const m = A.length;
  const n = A[0]!.length;
  const T: number[][] = Array.from({ length: n }, () => new Array<number>(m));
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      T[j]![i] = A[i]![j]!;
    }
  }
  return T;
}

/** Mátrix-szorzat: A (m×k) · B (k×n) = C (m×n) */
function matMul(A: number[][], B: number[][]): number[][] {
  const m = A.length;
  const k = B.length;
  const n = B[0]!.length;
  const C: number[][] = Array.from({ length: m }, () => new Array<number>(n).fill(0));
  for (let i = 0; i < m; i++) {
    for (let kk = 0; kk < k; kk++) {
      const a = A[i]![kk]!;
      if (a === 0) continue;
      for (let j = 0; j < n; j++) {
        C[i]![j] = C[i]![j]! + a * B[kk]![j]!;
      }
    }
  }
  return C;
}

/** Segédfüggvény: elem csomópontjainak kigyűjtése a hálóból (solverhez) */
export function elementNodes(
  meshNodes: Node[],
  element: Element,
): [Node, Node, Node] {
  const n1 = meshNodes[element.nodes[0]!]!;
  const n2 = meshNodes[element.nodes[1]!]!;
  const n3 = meshNodes[element.nodes[2]!]!;
  return [n1, n2, n3];
}
