/**
 * Ritka mátrix (CSR) + Conjugate Gradient szolver.
 * Szándékosan függőségmentes — a tanulási élmény része.
 */

/** Ritka mátrix sorritka (CSR) formátumban */
export class SparseMatrix {
  readonly n: number;
  /** sorkezdet-indexek, hossza n+1 */
  readonly rowPtr: number[];
  /** oszlopindexek */
  readonly colIdx: number[];
  /** nemnulla értékek */
  readonly values: number[];

  constructor(n: number, rowPtr: number[], colIdx: number[], values: number[]) {
    if (rowPtr.length !== n + 1) {
      throw new Error(`rowPtr hossza ${rowPtr.length}, várva ${n + 1}`);
    }
    this.n = n;
    this.rowPtr = rowPtr;
    this.colIdx = colIdx;
    this.values = values;
  }

  /**
   * COO (triplet) listából épít CSR mátrixot.
   * Az azonos (i,j) pozíciók értékeit ÖSSZEGZI — ez kell az elemmátrixok összerakásához.
   */
  static fromCOO(
    n: number,
    triplets: Array<[number, number, number]>,
  ): SparseMatrix {
    // oszlop szerint rendezés soron belül, azaz (i, j) lexikografikus rendezés
    const sorted = triplets.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const rowPtr = new Array<number>(n + 1).fill(0);
    const colIdx: number[] = [];
    const values: number[] = [];

    let prevI = -1;
    let prevJ = -1;
    for (const [i, j, v] of sorted) {
      if (i < 0 || i >= n || j < 0 || j >= n) {
        throw new Error(`Index outside the matrix: (${i}, ${j}), n=${n}`);
      }
      while (prevI < i) {
        prevI++;
        // Az i. sor kezdete = eddigi nemnullák száma (üres soroknál többször is fut)
        rowPtr[prevI] = colIdx.length;
        prevJ = -1; // új sor: az oszlop-összehasonlítás nullázandó!
      }
      if (i === prevI && j === prevJ) {
        const last = values.length - 1;
        values[last] = values[last]! + v;
      } else {
        colIdx.push(j);
        values.push(v);
        prevJ = j;
      }
    }
    // A maradék (üres) sorok rowPtr-jei
    while (prevI < n - 1) {
      prevI++;
      rowPtr[prevI] = colIdx.length;
    }
    rowPtr[n] = colIdx.length;
    return new SparseMatrix(n, rowPtr, colIdx, values);
  }

  /** Mátrix–vektor szorzat: y = A·x */
  matVec(x: Float64Array): Float64Array {
    const y = new Float64Array(this.n);
    for (let i = 0; i < this.n; i++) {
      let sum = 0;
      for (let k = this.rowPtr[i]!; k < this.rowPtr[i + 1]!; k++) {
        sum += this.values[k]! * x[this.colIdx[k]!]!;
      }
      y[i] = sum;
    }
    return y;
  }

  /** Átló elemei (CG előkondicionáláshoz) */
  diagonal(): Float64Array {
    const d = new Float64Array(this.n);
    for (let i = 0; i < this.n; i++) {
      for (let k = this.rowPtr[i]!; k < this.rowPtr[i + 1]!; k++) {
        if (this.colIdx[k] === i) {
          d[i] = this.values[k]!;
        }
      }
    }
    return d;
  }

  /** Kimenet: ritka mátrix dense alakban (teszteléshez) */
  toDense(): number[][] {
    const dense: number[][] = [];
    for (let i = 0; i < this.n; i++) {
      const row = new Array<number>(this.n).fill(0);
      for (let k = this.rowPtr[i]!; k < this.rowPtr[i + 1]!; k++) {
        row[this.colIdx[k]!] = this.values[k]!;
      }
      dense.push(row);
    }
    return dense;
  }
}

export interface CGResult {
  x: Float64Array;
  iterations: number;
  /** relatív maradék ||b − Ax|| / ||b|| */
  residual: number;
  converged: boolean;
}

/**
 * Conjugate Gradient szolver Jacobi (átlós) előkondicionálóval.
 * SPD mátrixokra konvergál; FEM merevségi mátrixok (rögzítéssel) pontosan ilyenek.
 */
export function conjugateGradient(
  A: SparseMatrix,
  b: Float64Array,
  options: { tol?: number; maxIter?: number } = {},
): CGResult {
  const tol = options.tol ?? 1e-10;
  const maxIter = options.maxIter ?? A.n;

  const n = A.n;
  const x = new Float64Array(n);
  const diag = A.diagonal();

  // r0 = b − A·x0 = b
  let r = b.slice();
  let z = precondition(diag, r);
  let p = z.slice();

  let rz = dot(r, z);
  const bNorm = Math.sqrt(dot(b, b));
  if (bNorm === 0) {
    return { x, iterations: 0, residual: 0, converged: true };
  }

  let iter = 0;
  for (; iter < maxIter; iter++) {
    // Konvergencia a VALÓDI maradéknormával: ||r|| / ||b||
    // (az előkondicionált rz csúszós lehet merev átlóknál)
    if (Math.sqrt(dot(r, r)) / bNorm < tol) break;

    const Ap = A.matVec(p);
    const pAp = dot(p, Ap);
    if (pAp === 0) break;
    const alpha = rz / pAp;

    for (let i = 0; i < n; i++) {
      x[i] = x[i]! + alpha * p[i]!;
      r[i] = r[i]! - alpha * Ap[i]!;
    }
    z = precondition(diag, r);
    const rzNew = dot(r, z);

    const beta = rzNew / rz;
    for (let i = 0; i < n; i++) {
      p[i] = z[i]! + beta * p[i]!;
    }
    rz = rzNew;
  }

  const residual = Math.sqrt(dot(r, r)) / bNorm;
  return { x, iterations: iter, residual, converged: residual < tol };
}

function precondition(diag: Float64Array, r: Float64Array): Float64Array {
  const z = new Float64Array(r.length);
  for (let i = 0; i < r.length; i++) {
    z[i] = diag[i] !== 0 ? r[i]! / diag[i]! : r[i]!;
  }
  return z;
}

function dot(a: Float64Array, b: Float64Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i]! * b[i]!;
  return s;
}
