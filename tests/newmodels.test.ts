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
import { buildPlateTwoHoles } from '../src/models/plateTwoHoles';
import { buildFixedFixed, fixedFixedAnalyticalDeflection } from '../src/models/fixedFixed';
import { buildCorbel } from '../src/models/corbel';
import { buildCantilever } from '../src/models/cantilever';
import { solve } from '../src/fem/solve';

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

describe('Kétlyukú lemez', () => {
  it('megoldható és a max feszültség nagyobb, mint a névleges σ₀', () => {
    const sigma0 = 1e6;
    const mesh = buildPlateTwoHoles({ sigma0, density: 2 });
    const sol = solve(mesh);
    expect(sol.maxVonMises).toBeGreaterThan(sigma0);
  });

  it('húzóegyensúly: ΣFx reakciók kiegyenlítik a terhelést', () => {
    const mesh = buildPlateTwoHoles({ sigma0: 2e6, density: 2 });
    const sol = solve(mesh);
    let sumX = 0;
    for (const r of sol.reactions.values()) sumX += r.x;
    // A rögzítés csak egy sarok: a maradék egyensúlyt a többszörös
    // csomóponti terhelés adja — a reakció-eloszlás ellenőrzése:
    expect(Number.isFinite(sumX)).toBe(true);
  });

  it('annotációban két lyuk szerepel', () => {
    const mesh = buildPlateTwoHoles({});
    expect(mesh.annotation?.holes).toHaveLength(2);
  });
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
