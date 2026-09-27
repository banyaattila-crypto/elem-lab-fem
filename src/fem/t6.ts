/**
 * T6 — hat csomópontú izoparaméteres háromszögelem (kvadratikus alakfüggvények).
 * Az alakváltozás lineárisan változhat az elemen belül → lényegesen pontosabb
 * hajlásnál, mint a CST.
 *
 * Csúcs-sorrend: [n1, n2, n3, m12, m23, m31] — 3 sarok + a 1-2, 2-3, 3-1 élek
 * középpontjai. Sarok-sorrend CCW.
 *
 * Természetes (területi) koordináták: L1 + L2 + L3 = 1,
 * sarokcsúcsok: (1,0,0), (0,1,0), (0,0,1);
 * oldalközépek: (½,½,0), (0,½,½), (½,0,½).
 *
 * Alakfüggvények:
 *   N1 = L1(2L1 − 1),  N2 = L2(2L2 − 1),  N3 = L3(2L3 − 1)
 *   N4 = 4·L1·L2,      N5 = 4·L2·L3,      N6 = 4·L3·L1
 */

import type { Material, Node } from './types';

/**
 * 3 pontos Gauss-szabály háromszögre — a kvadratikus integrandig EGZAKT.
 * Pontok: az élek középpontjai; a súlyok a referencia-területtel (½) együtt értendők:
 * ∫ f dL1dL2 ≈ Σ wᵢ·f(pᵢ), Σ wᵢ = ½ (wᵢ = 1/6).
 * A T6 B-mátrixa lineáris L-ben → BᵀDB kvadratikus → ez a szabály egzakt.
 */
export const T6_GAUSS = [
  { l1: 1 / 2, l2: 0, w: 1 / 6 },
  { l1: 1 / 2, l2: 1 / 2, w: 1 / 6 },
  { l1: 0, l2: 1 / 2, w: 1 / 6 },
] as const;

/** T6 alakfüggvények a (L1, L2) természetes koordinátákban; L3 = 1 − L1 − L2 */
export function t6Shape(l1: number, l2: number): [number, number, number, number, number, number] {
  const l3 = 1 - l1 - l2;
  return [
    l1 * (2 * l1 - 1),
    l2 * (2 * l2 - 1),
    l3 * (2 * l3 - 1),
    4 * l1 * l2,
    4 * l2 * l3,
    4 * l3 * l1,
  ];
}

/** Alakfüggvény-deriváltak: dN/dL1, dN/dL2.
 *  Láncszabály: L3 = 1 − L1 − L2, ∂L3/∂L1 = ∂L3/∂L2 = −1,
 *  ezért dN3/dL· = −(4L3−1)·(−1) = 1−4L3; dN5/dL1 = −4L2; dN6/dL2 = −4L1. */
export function t6ShapeDerivs(
  l1: number,
  l2: number,
): { dN_dL1: [number, number, number, number, number, number]; dN_dL2: [number, number, number, number, number, number] } {
  const l3 = 1 - l1 - l2;
  return {
    dN_dL1: [4 * l1 - 1, 0, 1 - 4 * l3, 4 * l2, -4 * l2, 4 * (l3 - l1)],
    dN_dL2: [0, 4 * l2 - 1, 1 - 4 * l3, 4 * l1, 4 * (l3 - l2), -4 * l1],
  };
}

/** T6 elem geometriája: a 6 csomópont (sarok CCW + oldalközépek) */
export interface T6Geometry {
  pts: [Node, Node, Node, Node, Node, Node];
  /** Sarok-háromszög területe (átlagos jacobian-ellenőrzéshez) */
  cornerArea: number;
}

export function t6Geometry(pts: [Node, Node, Node, Node, Node, Node]): T6Geometry {
  const [a, b, c] = pts;
  const cornerArea = 0.5 * ((b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y));
  if (cornerArea <= 0) {
    throw new Error('T6: a sarok-háromszög területe nem pozitív (CCW sarok-sorrend kell)');
  }
  return { pts, cornerArea };
}

/**
 * B(ξ,η) mátrix (3×12) egy Gauss-pontban: ε = B·uₑ.
 * Láncszabály: dN/dx = J⁻¹ · dN/dL.
 */
export function t6BMatrix(
  g: T6Geometry,
  l1: number,
  l2: number,
): { B: number[][]; detJ: number } {
  const { dN_dL1, dN_dL2 } = t6ShapeDerivs(l1, l2);

  // Jacobimátrix: x = Σ Nᵢ xᵢ → dx/dL1, dx/dL2
  let j11 = 0; // dx/dL1
  let j12 = 0; // dx/dL2
  let j21 = 0; // dy/dL1
  let j22 = 0; // dy/dL2
  for (let i = 0; i < 6; i++) {
    const p = g.pts[i]!;
    j11 += dN_dL1[i]! * p.x;
    j12 += dN_dL2[i]! * p.x;
    j21 += dN_dL1[i]! * p.y;
    j22 += dN_dL2[i]! * p.y;
  }
  const detJ = j11 * j22 - j12 * j21;
  if (detJ <= 0) {
    throw new Error(`T6: nem pozitív jacobian (detJ = ${detJ}) — torzult elem`);
  }
  const invDet = 1 / detJ;
  // Láncszabály (J sor-elrendezésben: J = [∂x/∂L1, ∂x/∂L2; ∂y/∂L1, ∂y/∂L2]):
  //   ∂N/∂x = ( j22·∂N/∂L1 − j21·∂N/∂L2 ) / detJ
  //   ∂N/∂y = ( −j12·∂N/∂L1 + j11·∂N/∂L2 ) / detJ
  // azaz (J⁻¹)ᵀ·[∂N/∂L1, ∂N/∂L2]ᵀ — kézi ellenőrzés: x = L2 egységháromszögen.
  const i11 = j22 * invDet;
  const i12 = -j21 * invDet;
  const i21 = -j12 * invDet;
  const i22 = j11 * invDet;

  const B: number[][] = [
    new Array<number>(12).fill(0),
    new Array<number>(12).fill(0),
    new Array<number>(12).fill(0),
  ];
  for (let i = 0; i < 6; i++) {
    const dNx = i11 * dN_dL1[i]! + i12 * dN_dL2[i]!;
    const dNy = i21 * dN_dL1[i]! + i22 * dN_dL2[i]!;
    B[0]![2 * i] = dNx; // εx sor
    B[1]![2 * i + 1] = dNy; // εy sor
    B[2]![2 * i] = dNy; // γxy sor
    B[2]![2 * i + 1] = dNx;
  }
  return { B, detJ };
}

/** D mátrix (megosztva a CST-vel, itt duplikálva a körkörös import ellen) */
export function t6Constitutive(
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
  const k = E / ((1 + nu) * (1 - 2 * nu));
  return [
    [k * (1 - nu), k * nu, 0],
    [k * nu, k * (1 - nu), 0],
    [0, 0, (k * (1 - 2 * nu)) / 2],
  ];
}

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

/**
 * T6 elemi merevségi mátrix (12×12), 3 pontos Gauss-integrációval:
 *   k = t · Σ_gp w_gp · detJ_gp · Bᵀ·D·B
 */
export function t6Stiffness(
  g: T6Geometry,
  D: number[][],
  thickness: number,
): number[][] {
  const k = Array.from({ length: 12 }, () => new Array<number>(12).fill(0));
  for (const gp of T6_GAUSS) {
    const { B, detJ } = t6BMatrix(g, gp.l1, gp.l2);
    const BT = transpose(B);
    const BTDB = matMul(BT, matMul(D, B));
    const w = gp.w * detJ;
    for (let i = 0; i < 12; i++) {
      for (let j = 0; j < 12; j++) {
        k[i]![j] = k[i]![j]! + w * BTDB[i]![j]!;
      }
    }
  }
  return k.map((row) => row.map((v) => v * thickness));
}

/** T6 elemi feszültség a Gauss-pontokban — átlagolva (elem-középérték) */
export function t6Stress(
  g: T6Geometry,
  D: number[][],
  uElem: number[],
): { sigmaX: number; sigmaY: number; tauXY: number } {
  let sX = 0;
  let sY = 0;
  let sT = 0;
  let wSum = 0;
  for (const gp of T6_GAUSS) {
    const { B, detJ } = t6BMatrix(g, gp.l1, gp.l2);
    const w = gp.w * detJ;
    wSum += w;
    // ε = B·u a Gauss-pontban
    const eps = [0, 0, 0];
    for (let i = 0; i < 3; i++) {
      let acc = 0;
      for (let j = 0; j < 12; j++) {
        acc += B[i]![j]! * uElem[j]!;
      }
      eps[i] = acc;
    }
    // σ = D·ε a Gauss-pontban, súlyozott összegzés
    sX += w * (D[0]![0]! * eps[0]! + D[0]![1]! * eps[1]! + D[0]![2]! * eps[2]!);
    sY += w * (D[1]![0]! * eps[0]! + D[1]![1]! * eps[1]! + D[1]![2]! * eps[2]!);
    sT += w * (D[2]![0]! * eps[0]! + D[2]![1]! * eps[1]! + D[2]![2]! * eps[2]!);
  }
  return { sigmaX: sX / wSum, sigmaY: sY / wSum, tauXY: sT / wSum };
}
