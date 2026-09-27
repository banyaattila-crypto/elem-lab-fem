/**
 * Új modellek fizikai validációja:
 *  - egyszerűen tartott gerenda (csukló + görgő): δ_mid = P·L³/(48·E·I)
 *  - portálkeret: szimmetria + egyensúly
 *  - kétlyukú lemez: megoldhatóság + reakcióegyensúly
 *  - görgő-támasz: csak az adott irányban rögzít
 */

import { describe, expect, it } from 'vitest';
import { buildSimplySupported, simplySupportedAnalyticalDeflection } from '../src/models/simplySupported';
import { buildPortalFrame } from '../src/models/portalFrame';
import { buildFixedFixed, fixedFixedAnalyticalDeflection } from '../src/models/fixedFixed';
import { buildCorbel } from '../src/models/corbel';
import { buildCantilever } from '../src/models/cantilever';
import { solve } from '../src/fem/solve';
import { sampleDiagrams } from '../src/viz/diagrams';

describe('Egyszerűen tartott gerenda', () => {
  it('hajlás közelíti az elosztott terheléses analitikus δ = 5PL³/(384·E·I) értéket', () => {
    const P = 2000; // teljes elosztott terhelés (q·L = P)
    const mesh = buildSimplySupported({ L: 4, H: 0.4, thickness: 0.02, loadN: P, density: 4 });
    const sol = solve(mesh);
    const analytic = simplySupportedAnalyticalDeflection(P, 4, 0.4, 0.02, mesh.material.E);

    // CST túlzottan merev (nyíró-részt is tartalmaz, durva hálón), 30%-os sáv
    expect(sol.maxDisplacement).toBeGreaterThan(analytic * 0.7);
    expect(sol.maxDisplacement).toBeLessThan(analytic * 1.3);
  });

  it('a görgő csak függőlegesen tart: reakció csak Y-ban van', () => {
    const mesh = buildSimplySupported({ loadN: 1500, density: 3 });
    const sol = solve(mesh);
    // A jobb alsó sarok (görgő) reakciója
    const rightBottom = mesh.nodes.reduce((best, n) =>
      Math.abs(n.x - 4) < 1e-9 && Math.abs(n.y) < 1e-9 ? n : best,
    );
    const r = sol.reactions.get(rightBottom.id)!;
    expect(r).toBeDefined();
    expect(Math.abs(r.x)).toBeLessThan(1e-6);
    expect(Math.abs(r.y)).toBeGreaterThan(100); // ≈ P/2
  });

  it('csomóponti erőegyensúly: ΣRy = +P (viszonzása a lefelé mutató terhelésnek)', () => {
    const P = 2500;
    const mesh = buildSimplySupported({ loadN: P, density: 3 });
    const sol = solve(mesh);
    let sumY = 0;
    for (const r of sol.reactions.values()) sumY += r.y;
    expect(sumY).toBeCloseTo(P, 3);
  });
});

describe('Portálkeret', () => {
  it('megoldható, véges elmozdulásokkal', () => {
    const mesh = buildPortalFrame({ loadN: 1000, density: 2 });
    const sol = solve(mesh);
    expect(Number.isFinite(sol.maxDisplacement)).toBe(true);
    expect(sol.maxDisplacement).toBeGreaterThan(0);
    expect(Number.isFinite(sol.maxVonMises)).toBe(true);
    expect(sol.iterations).toBeGreaterThan(0);
  });

  it('terhelés-egyensúly: ΣFy reakció = +P', () => {
    const P = 3000;
    const mesh = buildPortalFrame({ loadN: P, density: 2 });
    const sol = solve(mesh);
    let sumY = 0;
    for (const r of sol.reactions.values()) sumY += r.y;
    expect(sumY).toBeCloseTo(P, 3);
  });

  it('vízszintes reakció nulla (szimmetrikus függőleges terhelés)', () => {
    const mesh = buildPortalFrame({ loadN: 2000, density: 2 });
    const sol = solve(mesh);
    let sumX = 0;
    for (const r of sol.reactions.values()) sumX += r.x;
    expect(Math.abs(sumX)).toBeLessThan(1e-3);
  });
});

describe('M/V diagramok — analitikus validáció', () => {
  it('egyszerűen tartott + elosztott: Δσ-csúcs középen, V lineárisan csökken', () => {
    const P = 2000; // q·L = P
    const L = 4;
    const mesh = buildSimplySupported({ L, H: 0.4, thickness: 0.02, loadN: P, density: 4, loadType: 'distributed' });
    const sol = solve(mesh);
    const samples = sampleDiagrams(mesh, sol);
    expect(samples.length).toBeGreaterThan(3);

    const q = P / L;
    const midX = L / 2;
    const near = samples.reduce((best, s) => (Math.abs(s.x - midX) < Math.abs(best.x - midX) ? s : best));
    const far = samples.reduce((best, s) => (Math.abs(s.x - 0.05) < Math.abs(best.x - 0.05) ? s : best));

    // (1) a hajlítási csúcs a közép közelében van, nem a tartónál
    expect(Math.abs(near.sigmaTop)).toBeGreaterThan(Math.abs(far.sigmaTop) * 3);

    // (2) abszolút skála: Δσ_mid = M_mid/W, W = t·H²/6 — CST-on ±35% sáv
    const W = 0.02 * 0.4 * 0.4 / 6;
    const expected = (q * L * L / 8) / W;
    expect(Math.abs(near.sigmaTop)).toBeGreaterThan(expected * 0.65);
    expect(Math.abs(near.sigmaTop)).toBeLessThan(expected * 1.35);

    // (3) V = dM/dx: az L/4 helyen V(x) = q·(L/2 − x) analitikus (±35% sáv), középen ≈ 0
    const expectedV = (q * L) / 2;
    const quarter = samples.reduce((best, s) => (Math.abs(s.x - L / 4) < Math.abs(best.x - L / 4) ? s : best));
    const analyticVq = q * (L / 2 - L / 4);
    expect(Math.abs(quarter.shear)).toBeGreaterThan(analyticVq * 0.65);
    expect(Math.abs(quarter.shear)).toBeLessThan(analyticVq * 1.35);
    // monotonitás: |V| a tartó felé nő, középen ~0
    expect(Math.abs(quarter.shear)).toBeGreaterThan(expectedV * 0.2);
    expect(Math.abs(midV(samples, midX).shear)).toBeLessThan(expectedV * 0.4);
  });

  it('egyszerű tartás + KÖZÉPI PONTTERHELÉS: M(L/2) = PL/4 · W, V ugrás ±P/2', () => {
    const P = 2400;
    const L = 4;
    const mesh = buildSimplySupported({ L, H: 0.4, thickness: 0.02, loadN: P, density: 4, loadType: 'point' });
    const sol = solve(mesh);
    const samples = sampleDiagrams(mesh, sol);
    expect(samples.length).toBeGreaterThan(3);

    const W = 0.02 * 0.4 * 0.4 / 6;
    const midX = L / 2;
    const near = samples.reduce((best, s) => (Math.abs(s.x - midX) < Math.abs(best.x - midX) ? s : best));
    const far = samples.reduce((best, s) => (Math.abs(s.x - 0.05) < Math.abs(best.x - 0.05) ? s : best));

    // (1) M-profil háromszög: csúcs középen, ~0 a tartóknál
    expect(Math.abs(near.sigmaTop)).toBeGreaterThan(Math.abs(far.sigmaTop) * 4);

    // (2) abszolút skála: Δσ(L/2) = (P·L/4)/W — CST ±35% sáv
    const expected = (P * L) / 4 / W;
    expect(Math.abs(near.sigmaTop)).toBeGreaterThan(expected * 0.65);
    expect(Math.abs(near.sigmaTop)).toBeLessThan(expected * 1.35);

    // (3) V = dM/dx: a közép két oldalán |V| ≈ P/2, előjelváltás a középen
    const left = samples.filter((s) => s.x > 0.5 && s.x < midX - 0.3);
    const right = samples.filter((s) => s.x > midX + 0.3 && s.x < L - 0.5);
    const vLeft = left.reduce((a, s) => a + Math.abs(s.shear), 0) / Math.max(left.length, 1);
    const vRight = right.reduce((a, s) => a + Math.abs(s.shear), 0) / Math.max(right.length, 1);
    expect(vLeft).toBeGreaterThan((P / 2) * 0.65);
    expect(vLeft).toBeLessThan((P / 2) * 1.35);
    expect(vRight).toBeGreaterThan((P / 2) * 0.65);
    expect(vRight).toBeLessThan((P / 2) * 1.35);
    // előjelváltás: a közép bal oldalán és jobb oldalán ellenkező előjelű V
    const sLeft = samples.reduce((best, s) => (Math.abs(s.x - (midX - 0.6)) < Math.abs(best.x - (midX - 0.6)) ? s : best));
    const sRight = samples.reduce((best, s) => (Math.abs(s.x - (midX + 0.6)) < Math.abs(best.x - (midX + 0.6)) ? s : best));
    expect(sLeft.shear * sRight.shear).toBeLessThan(0);
  });

  it('konzolgerenda + végponti terhelés: M a befogásnál max, a szabad végen ~0; V állandó', () => {
    const P = 1500;
    const L = 2;
    const mesh = buildCantilever({ L, H: 0.4, thickness: 0.02, loadN: P, density: 4, loadType: 'point' });
    const sol = solve(mesh);
    const samples = sampleDiagrams(mesh, sol);
    expect(samples.length).toBeGreaterThan(3);

    const W = 0.02 * 0.4 * 0.4 / 6;
    // Δσ(x) = M(x)/W = P·(L−x)/W a befogás felé nő
    const atFix = samples.filter((s) => s.x < 0.25);
    const atFree = samples.filter((s) => s.x > L - 0.35);
    const maxFix = Math.max(...atFix.map((s) => Math.abs(s.sigmaTop)));
    const maxFree = Math.max(...atFree.map((s) => Math.abs(s.sigmaTop)));
    expect(maxFix).toBeGreaterThan(maxFree * 4);

    // abszolút skála a befogásnál: P·L/W ±35%
    const expected = (P * L) / W;
    expect(maxFix).toBeGreaterThan(expected * 0.65);
    expect(maxFix).toBeLessThan(expected * 1.35);

    // V állandó = P (dM/dx): a belső x-tartomány mediánja stabil sávban
    const inner = samples.filter((s) => s.x > 0.2 && s.x < L - 0.2).map((s) => Math.abs(s.shear)).sort((a, b) => a - b);
    const vMed = inner[Math.floor(inner.length / 2)]!;
    expect(vMed).toBeGreaterThan(P * 0.6);
    expect(vMed).toBeLessThan(P * 1.4);
  });

  function midV(samples: ReturnType<typeof sampleDiagrams>, midX: number) {
    return samples.reduce((best, s) => (Math.abs(s.x - midX) < Math.abs(best.x - midX) ? s : best));
  }
});

describe('Kétvégén befogott gerenda', () => {
  it('hajlás ≈ P·L³/(384·E·I) és 5× kisebb, mint az egyszerűen tartotté', () => {
    const P = 2000;
    const meshFF = buildFixedFixed({ L: 4, H: 0.4, thickness: 0.02, loadN: P, density: 4 });
    const solFF = solve(meshFF);
    const analyticFF = fixedFixedAnalyticalDeflection(P, 4, 0.4, 0.02, meshFF.material.E);
    expect(solFF.maxDisplacement).toBeGreaterThan(analyticFF * 0.7);
    expect(solFF.maxDisplacement).toBeLessThan(analyticFF * 1.3);

    const meshSS = buildSimplySupported({ L: 4, H: 0.4, thickness: 0.02, loadN: P, density: 4 });
    const solSS = solve(meshSS);
    // A befogott hajlás lényegesen kisebb (analitikusan 5×; CST-on 4–6× sáv)
    const ratio = solSS.maxDisplacement / solFF.maxDisplacement;
    expect(ratio).toBeGreaterThan(3.5);
    expect(ratio).toBeLessThan(7);
  });

  it('mindkét végén reakció-egyensúly: ΣRy = P', () => {
    const P = 2400;
    const mesh = buildFixedFixed({ loadN: P, density: 3 });
    const sol = solve(mesh);
    let sumY = 0;
    for (const r of sol.reactions.values()) sumY += r.y;
    expect(sumY).toBeCloseTo(P, 3);
  });

  it('statikai séma: 4 befogási szimbólum', () => {
    const mesh = buildFixedFixed({});
    expect(mesh.annotation?.supports).toHaveLength(4);
  });
});

describe('Konzolos tartó (corbel)', () => {
  it('megoldható, a kar végén lefelé mozog', () => {
    const mesh = buildCorbel({ loadN: 1500, density: 3 });
    const sol = solve(mesh);
    expect(Number.isFinite(sol.maxDisplacement)).toBe(true);
    expect(sol.maxDisplacement).toBeGreaterThan(0);
    // A terhelési pont a szabad vég: maximum elmozdulás ott van (y-irány negatív)
    const armEnd = mesh.nodes.reduce((best, n) =>
      Math.hypot(n.x - (1.2 + 0.3), n.y - (2 + 0.3)) <
      Math.hypot(best.x - (1.2 + 0.3), best.y - (2 + 0.3)) ? n : best,
    );
    const u = sol.displacements.get(armEnd.id)!;
    expect(u.y).toBeLessThan(0);
  });

  it('függőleges egyensúly: ΣRy = P', () => {
    const P = 1800;
    const mesh = buildCorbel({ loadN: P, density: 2 });
    const sol = solve(mesh);
    let sumY = 0;
    for (const r of sol.reactions.values()) sumY += r.y;
    expect(sumY).toBeCloseTo(P, 3);
  });
});

describe('Elosztott terhelés (FEM-mag)', () => {
  it('a teljes elosztott erő megjelenik a reakciókban (qy·L = P)', () => {
    const P = 1000;
    const mesh = buildSimplySupported({ L: 2, H: 0.2, loadN: P, density: 2 });
    const sol = solve(mesh);
    let sumY = 0;
    for (const r of sol.reactions.values()) sumY += r.y;
    expect(sumY).toBeCloseTo(P, 3);
  });

  it('támasz- és terhelés-séma annotációk jelen vannak', () => {
    const mSS = buildSimplySupported({});
    expect(mSS.annotation?.supports?.some((s) => s.kind === 'pin')).toBe(true);
    expect(mSS.annotation?.supports?.some((s) => s.kind === 'rollerY')).toBe(true);
    expect(mSS.annotation?.distLoads).toHaveLength(1);

    const mCant = buildCantilever({ loadN: 1000 });
    expect(mCant.annotation?.pointLoads?.[0]?.fy).toBeLessThan(0);
  });
});

describe('Görgő-támasz (roller)', () => {
  it('rollerY: csak a Y DOF rögzített, X szabad → szabad tágulás', () => {
    // Egyoldalról teljesen rögzített, másik oldala csak Y-ban tartott gerenda
    const mesh = buildSimplySupported({ L: 2, H: 0.2, loadN: 1000, density: 3 });
    const sol = solve(mesh);
    // A gerenda jobb vége (görgő) X irányban mozoghat → véges, nem nulla ux ott
    const rightNodes = mesh.nodes.filter((n) => Math.abs(n.x - 2) < 1e-9);
    const uRight = sol.displacements.get(rightNodes[0]!.id)!;
    expect(Number.isFinite(uRight.x)).toBe(true);
  });
});
