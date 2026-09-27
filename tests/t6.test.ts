/**
 * T6 kvadratikus elem tesztek.
 * Klasszikus ellenőrzések: merevtest-mozgás → nulla erő;
 * lineáris elmozdulási mező → konstans feszültség (patch-teszt);
 * konverzió és teljes szolver.
 */

import { describe, expect, it } from 'vitest';
import { t6Geometry, t6Stiffness, t6Constitutive, t6Stress, t6Shape } from '../src/fem/t6';
import { convertToT6 } from '../src/models/t6convert';
import { buildCantilever } from '../src/models/cantilever';
import { solve } from '../src/fem/solve';
import type { Node } from '../src/fem/types';

const mat = { name: 'teszt', E: 210e9, nu: 0.3 };

function unitTriangle(): Parameters<typeof t6Geometry>[0] {
  // Egység-háromszög CCW sarkokkal, élközépekkel
  const mk = (id: number, x: number, y: number): Node => ({ id, x, y });
  return [
    mk(0, 0, 0),
    mk(1, 1, 0),
    mk(2, 0, 1),
    mk(3, 0.5, 0), // m12
    mk(4, 0.5, 0.5), // m23
    mk(5, 0, 0.5), // m31
  ];
}

describe('T6 alakfüggvények', () => {
  it('csúcspontokban a saját alakfüggvény 1, a többi 0', () => {
    const corners = [
      [1, 0], // L1=1
      [0, 1], // L2=1
      [0, 0], // L3=1
    ];
    for (let c = 0; c < 3; c++) {
      const N = t6Shape(corners[c]![0]!, corners[c]![1]!);
      for (let i = 0; i < 6; i++) {
        expect(N[i]).toBeCloseTo(i === c ? 1 : 0, 12);
      }
    }
  });

  it('partíció egység: ΣN = 1 belső pontban', () => {
    const N = t6Shape(0.25, 0.25);
    const sum = N.reduce((s, v) => s + v, 0);
    expect(sum).toBeCloseTo(1, 12);
  });
});

describe('T6 merevségi mátrix', () => {
  it('merevtest X-eltolás: k · u = 0', () => {
    const g = t6Geometry(unitTriangle());
    const D = t6Constitutive(mat, 'plane-stress');
    const k = t6Stiffness(g, D, 0.01);
    // u = [1,0, 1,0, 1,0, 1,0, 1,0, 1,0]
    const u = new Array<number>(12).fill(0);
    for (let i = 0; i < 6; i++) u[2 * i] = 1;
    const r = k.map((row) => row.reduce((s, v, j) => s + v * u[j]!, 0));
    for (const v of r) expect(Math.abs(v)).toBeLessThan(1e-6);
  });

  it('merevtest Y-eltolás: k · u = 0', () => {
    const g = t6Geometry(unitTriangle());
    const D = t6Constitutive(mat, 'plane-stress');
    const k = t6Stiffness(g, D, 0.01);
    const u = new Array<number>(12).fill(0);
    for (let i = 0; i < 6; i++) u[2 * i + 1] = 1;
    const r = k.map((row) => row.reduce((s, v, j) => s + v * u[j]!, 0));
    for (const v of r) expect(Math.abs(v)).toBeLessThan(1e-6);
  });

  it('szimmetrikus', () => {
    const g = t6Geometry(unitTriangle());
    const D = t6Constitutive(mat, 'plane-stress');
    const k = t6Stiffness(g, D, 0.01);
    for (let i = 0; i < 12; i++) {
      for (let j = 0; j < 12; j++) {
        expect(k[i]![j]).toBeCloseTo(k[j]![i]!, 8);
      }
    }
  });
});

describe('T6 patch-teszt: lineáris u → konstans ε', () => {
  it('tiszta nyírás: u_x = 0.001·y → γxy = 0.001, σxy = G·γ', () => {
    const g = t6Geometry(unitTriangle());
    const D = t6Constitutive(mat, 'plane-stress');
    const G = mat.E / (2 * (1 + mat.nu));
    // u_x = 0.001·y, u_y = 0 → εx = ∂u_x/∂x = 0, εy = 0, γxy = ∂u_x/∂y + ∂u_y/∂x = 0.001
    const u: number[] = [];
    for (const p of g.pts) u.push(0.001 * p.y, 0);
    const s = t6Stress(g, D, u);
    expect(s.sigmaX).toBeCloseTo(0, 6);
    expect(s.sigmaY).toBeCloseTo(0, 6);
    expect(s.tauXY).toBeCloseTo(G * 0.001, 4);
  });
});

describe('convertToT6 + teljes szolver', () => {
  it('konzolgerenda T6-tal: hajlás jobb, mint CST-vel', () => {
    const P = 1000;
    const L = 2;
    const H = 0.4;
    const t = 0.02;
    const E = 210e9;
    const opts = { L, H, thickness: t, loadN: P, density: 3 };

    const meshCST = buildCantilever(opts);
    const solCST = solve(meshCST);

    const meshT6 = convertToT6(buildCantilever(opts));
    const solT6 = solve(meshT6);

    const I = (t * H ** 3) / 12;
    const analytical = (P * L ** 3) / (3 * E * I);

    // A T6 közelebb legyen az analitikus hajláshoz, mint a CST
    const errCST = Math.abs(solCST.maxDisplacement / analytical - 1);
    const errT6 = Math.abs(solT6.maxDisplacement / analytical - 1);
    expect(errT6).toBeLessThan(errCST);
    // és sávba essen
    expect(solT6.maxDisplacement / analytical).toBeGreaterThan(0.9);
    expect(solT6.maxDisplacement / analytical).toBeLessThan(1.05);
  });

  it('konverzió: csomópont- és DOF-szám konzisztens', () => {
    const mesh = convertToT6(buildCantilever({ density: 2 }));
    expect(mesh.elementType).toBe('T6');
    expect(mesh.elements.every((e) => e.nodes.length === 6)).toBe(true);
    // minden elem-id egyedi
    const ids = new Set(mesh.elements.map((e) => e.id));
    expect(ids.size).toBe(mesh.elements.length);
  });
});
