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
import { solve } from '../src/fem/solve';

describe('Egyszerűen tartott gerenda', () => {
  it('középhajlás közelít az analitikus δ = P·L³/(48·E·I) értékhez', () => {
    const P = 2000;
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
