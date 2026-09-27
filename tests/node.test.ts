/**
 * Csomópont-vizsgálat fizikai tesztek.
 * A legfontosabb invariáns: Σ reakciók + Σ terhelések = 0 (globális erőegyensúly).
 */

import { describe, expect, it } from 'vitest';
import { buildCantilever } from '../src/models/cantilever';
import { buildTrussBridge } from '../src/models/trussBridge';
import { solve } from '../src/fem/solve';
import { inspectNode } from '../src/ui/nodepanel';
import { findNodeAt } from '../src/viz/picking';

describe('Reakcióerők — globális erőegyensúly', () => {
  it('konzolgerenda: ΣR + ΣF = 0 (mindkét komponensre)', () => {
    const P = 1500;
    const mesh = buildCantilever({ loadN: P, density: 3 });
    const sol = solve(mesh);

    let rx = 0;
    let ry = 0;
    for (const r of sol.reactions.values()) {
      rx += r.x;
      ry += r.y;
    }
    // Terhelés: egyetlen -Y erő P nagysággal
    let fx = 0;
    let fy = 0;
    for (const f of Object.values(mesh.bc.loads)) {
      fx += f.x;
      fy += f.y;
    }
    expect(rx + fx).toBeCloseTo(0, 6);
    expect(ry + fy).toBeCloseTo(0, 6);
  });

  it('konzolgerenda: a befogás átveszi a teljes terhelést (Ry = −Fy)', () => {
    const P = 2000;
    const mesh = buildCantilever({ loadN: P, density: 3 });
    const sol = solve(mesh);

    let ry = 0;
    for (const r of sol.reactions.values()) ry += r.y;
    expect(ry).toBeCloseTo(P, 6);
  });

  it('rácsos híd: ΣR + ΣF = 0', () => {
    const P = 8000;
    const mesh = buildTrussBridge({ loadN: P, panels: 6 });
    const sol = solve(mesh);

    let rx = 0;
    let ry = 0;
    for (const r of sol.reactions.values()) {
      rx += r.x;
      ry += r.y;
    }
    let fy = 0;
    for (const f of Object.values(mesh.bc.loads)) fy += f.y;
    expect(rx).toBeCloseTo(0, 6);
    expect(ry + fy).toBeCloseTo(0, 6);
  });

  it('rácsos híd: szimmetrikus terhelésnél a két támasz felezi a terhelést', () => {
    const P = 6000;
    const mesh = buildTrussBridge({ loadN: P, panels: 6 });
    const sol = solve(mesh);

    // Csak alsó-él csomópontok reakciói (a híd mindkét vége alsó övön rögzített)
    const reactions = [...sol.reactions.values()].map((r) => r.y).sort((a, b) => a - b);
    expect(reactions.length).toBeGreaterThanOrEqual(2);
    // Összeg = P
    const sum = reactions.reduce((s, v) => s + v, 0);
    expect(sum).toBeCloseTo(P, 6);
  });
});

describe('inspectNode', () => {
  it('rögzített csomópont: isFixed + reakció elérhető', () => {
    const mesh = buildCantilever({ loadN: 1000, density: 3 });
    const sol = solve(mesh);
    const fixedId = mesh.bc.fixed[0]!;
    const insp = inspectNode(mesh, sol, fixedId);
    expect(insp.isFixed).toBe(true);
    expect(insp.reaction).not.toBeNull();
    expect(insp.neighborElements.length).toBeGreaterThan(0);
  });

  it('terhelt csomópont: load visszaadása', () => {
    const mesh = buildCantilever({ loadN: 1000, density: 3 });
    const sol = solve(mesh);
    const loadId = Number(Object.keys(mesh.bc.loads)[0]!);
    const insp = inspectNode(mesh, sol, loadId);
    expect(insp.load).not.toBeNull();
    expect(insp.load!.y).toBeCloseTo(-1000, 9);
  });
});

describe('findNodeAt', () => {
  it('a legközelebbi csomópontot adja tolerancián belül', () => {
    const mesh = buildCantilever({ L: 2, H: 0.4, density: 2 });
    // sarokcsomópont (0,0) közelében
    expect(findNodeAt(mesh, 0.001, 0.001, 0.05)).not.toBeNull();
    // messze minden csomóponttól
    expect(findNodeAt(mesh, 0.03, 0.03, 0.01)).toBeNull();
  });
});
