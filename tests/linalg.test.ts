/**
 * Lineáris algebra tesztek: CSR mátrix és CG-szolver.
 */

import { describe, expect, it } from 'vitest';
import { conjugateGradient, SparseMatrix } from '../src/fem/linalg';

describe('SparseMatrix.fromCOO', () => {
  it('összeadja az azonos pozíciók értékeit', () => {
    const A = SparseMatrix.fromCOO(2, [
      [0, 0, 1],
      [0, 0, 2],
      [1, 1, 3],
    ]);
    const dense = A.toDense();
    expect(dense[0]![0]).toBe(3);
    expect(dense[1]![1]).toBe(3);
  });

  it('matVec helyes eredményt ad', () => {
    const A = SparseMatrix.fromCOO(2, [
      [0, 0, 2],
      [0, 1, 1],
      [1, 1, 4],
    ]);
    const x = new Float64Array([1, 2]);
    const y = A.matVec(x);
    expect(y[0]).toBe(4); // 2·1 + 1·2
    expect(y[1]).toBe(8); // 4·2
  });

  it('a diagonal() az átlót adja vissza', () => {
    const A = SparseMatrix.fromCOO(3, [
      [0, 0, 5],
      [1, 1, 7],
      [2, 2, 9],
      [0, 2, 1],
    ]);
    const d = A.diagonal();
    expect(d[0]).toBe(5);
    expect(d[1]).toBe(7);
    expect(d[2]).toBe(9);
  });
});

describe('conjugateGradient', () => {
  it('diagonális rendszer: x = b / d', () => {
    const A = SparseMatrix.fromCOO(3, [
      [0, 0, 2],
      [1, 1, 4],
      [2, 2, 8],
    ]);
    const b = new Float64Array([2, 8, 24]);
    const res = conjugateGradient(A, b, { tol: 1e-12 });
    expect(res.converged).toBe(true);
    expect(res.x[0]).toBeCloseTo(1, 6);
    expect(res.x[1]).toBeCloseTo(2, 6);
    expect(res.x[2]).toBeCloseTo(3, 6);
  });

  it('sűrű SPD rendszer: K·u = f megoldása pontos', () => {
    // 2×2 SPD mátrix: [[4,1],[1,3]]
    const A = SparseMatrix.fromCOO(2, [
      [0, 0, 4],
      [0, 1, 1],
      [1, 0, 1],
      [1, 1, 3],
    ]);
    const b = new Float64Array([1, 2]);
    const res = conjugateGradient(A, b, { tol: 1e-12 });
    // u = [1/11, 7/11]
    expect(res.x[0]).toBeCloseTo(1 / 11, 10);
    expect(res.x[1]).toBeCloseTo(7 / 11, 10);
  });

  it('nulla jobboldalnál azonnal konvergál', () => {
    const A = SparseMatrix.fromCOO(2, [
      [0, 0, 1],
      [1, 1, 1],
    ]);
    const b = new Float64Array([0, 0]);
    const res = conjugateGradient(A, b);
    expect(res.iterations).toBe(0);
    expect(res.converged).toBe(true);
  });
});
