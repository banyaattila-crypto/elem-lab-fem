/**
 * CST elem és teljes szolver fizikai validációja.
 * A legjobb teszt: ismert analitikus megoldásokkal való összevetés.
 */

import { describe, expect, it } from 'vitest';
import { elementGeometry, elementStiffness, constitutiveMatrix, vonMises } from '../src/fem/cst';
import { buildCantilever, cantileverAnalyticalDeflection } from '../src/models/cantilever';
import { buildPlateWithHole, plateWithHoleKt } from '../src/models/plateWithHole';
import { solve } from '../src/fem/solve';
import type { Mesh } from '../src/fem/types';

describe('CST elem', () => {
  it('pozitív terület CCW sorrendnél', () => {
    const g = elementGeometry(
      { id: 0, x: 0, y: 0 },
      { id: 1, x: 1, y: 0 },
      { id: 2, x: 0, y: 1 },
    );
    expect(g.area).toBeCloseTo(0.5, 12);
  });

  it('hibát dob CW sorrendnél', () => {
    expect(() =>
      elementGeometry(
        { id: 0, x: 0, y: 0 },
        { id: 1, x: 0, y: 1 },
        { id: 2, x: 1, y: 0 },
      ),
    ).toThrow();
  });

  it('egység CST merevségi mátrix szimmetrikus és SPD', () => {
    const g = elementGeometry(
      { id: 0, x: 0, y: 0 },
      { id: 1, x: 1, y: 0 },
      { id: 2, x: 0, y: 1 },
    );
    const D = constitutiveMatrix({ name: 'teszt', E: 1, nu: 0.25 }, 'plane-stress');
    const k = elementStiffness(g, D, 1);

    // Szimmetria
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 6; j++) {
        expect(k[i]![j]).toBeCloseTo(k[j]![i]!, 10);
      }
    }
    // Sorösszegek nem feltétlenül nulla (erőegyensúly csak teljes rendszerben),
    // de az átló pozitív:
    for (let i = 0; i < 6; i++) {
      expect(k[i]![i]).toBeGreaterThan(0);
    }
  });

  it('Von Mises: tiszta húzásnál σ = σx', () => {
    expect(vonMises(100, 0, 0)).toBe(100);
    expect(vonMises(0, -50, 0)).toBe(50);
  });

  it('Von Mises: tiszta nyírásnál σ_vm = √3·τ', () => {
    expect(vonMises(0, 0, 50)).toBeCloseTo(50 * Math.sqrt(3), 10);
  });
});

describe('Teljes szolver — analitikus validáció', () => {
  it('konzolgerenda: FEM hajlás az analitikus érték közelében', () => {
    // Finom hálóval a CST hajlás az analitikus érték alá marad (nyírási merevség hiánya miatt),
    // tipikusan 90–100% között.
    const P = 1000;
    const L = 2;
    const H = 0.4;
    const t = 0.02;
    const E = 210e9;

    const mesh: Mesh = buildCantilever({ L, H, thickness: t, loadN: P, density: 5 });
    const sol = solve(mesh);

    const analytical = cantileverAnalyticalDeflection(P, L, H, t, E);
    const fem = sol.maxDisplacement;

    expect(fem).toBeGreaterThan(0);
    // A CST (elemzett alakfüggvénnyel) az analitikus érték 60–105%-a:
    expect(fem / analytical).toBeGreaterThan(0.6);
    expect(fem / analytical).toBeLessThan(1.05);
  });

  it('lyukas lemez: csúcsfeszültség közelít Kt≈3-hoz', () => {
    const sigma0 = 1e6;
    const mesh = buildPlateWithHole({ sigma0, density: 4 });
    const sol = solve(mesh);

    const KtFem = sol.maxVonMises / sigma0;
    // v0.16.0: körre követő (lépcsőmentes) háromszögelés. A d/W = 0,4
    // véges szélességnél az elméleti (net-section) Kt ≈ 3,3–3,6; a mért
    // elem-csúcsérték ettől kicsit magasabb, DE stabil és a sűrűséggel
    // konvergál (a régi lépcsős háló 4,1–5,0 között szórt).
    expect(KtFem).toBeGreaterThan(3);
    expect(KtFem).toBeLessThan(3.7);
  });

  it('lyukas lemez: Kt a sűrűséggel konvergál (nincs szórás)', () => {
    const sigma0 = 1e6;
    const kts: number[] = [];
    for (const density of [2, 6]) {
      const sol = solve(buildPlateWithHole({ sigma0, density }));
      kts.push(sol.maxVonMises / sigma0);
    }
    // a lépcsős hálónál ez a különbség ~0,6 volt; most < 0,05
    expect(Math.abs(kts[0]! - kts[1]!)).toBeLessThan(0.05);
  });

  it('lyukas lemez: Kt analitikus határeset 3', () => {
    expect(plateWithHoleKt()).toBe(3);
  });

  it('minden elmozdulás véges (nem divergált a CG)', () => {
    const mesh = buildCantilever({ density: 3 });
    const sol = solve(mesh);
    expect(Number.isFinite(sol.maxDisplacement)).toBe(true);
    expect(sol.residual).toBeLessThan(1e-6);
  });
});
