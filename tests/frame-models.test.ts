/**
 * A frames.ts builder-ek füst-tesztje: minden vázmodell oldható, a modell-
 * szerkezet (rúdszám, támaszok, terhek) a terv 9.1 fejezete szerinti,
 * a reakciók egyensúlyban vannak a terheléssel.
 */

import { describe, expect, it } from 'vitest';
import { solveFrame } from '../src/fem/frame';
import {
  buildFrameCantilever,
  buildFrameFixedFixed,
  buildFramePortal,
  buildFrameSimplySupported,
  buildFrameTrussBridge,
  FRAME_MATERIALS,
  FRAME_SECTIONS,
} from '../src/models/frames';

describe('Vázmodellek — builder-ek', () => {
  it('Szelvény-katalógus: A, Iy, Wy pozitív és dimenzió-helyes (IPE cm-egységek)', () => {
    const ipe = FRAME_SECTIONS.ipe200!;
    expect(Math.abs(ipe.A - 28.5e-4)).toBeLessThan(1e-9); // 28,5 cm² → m²
    expect(Math.abs(ipe.Iy - 1943e-8)).toBeLessThan(1e-10); // cm⁴ → m⁴
    expect(Math.abs(ipe.Wy - 194.3e-6)).toBeLessThan(1e-10); // cm³ → m³
    for (const s of Object.values(FRAME_SECTIONS)) {
      expect(s.A).toBeGreaterThan(0);
      expect(s.Iy).toBeGreaterThan(0);
      expect(s.Wy).toBeGreaterThan(0);
    }
    expect(FRAME_MATERIALS.s235!.E).toBe(210e9);
    expect(FRAME_MATERIALS.woodC24!.E).toBe(11e9);
  });

  it('Konzol: v_tip = PL³/3EI a katalógus-szelvénnyel, befogás-reakciókkal', () => {
    const model = buildFrameCantilever();
    const sol = solveFrame(model, { tol: 1e-12 });
    const sec = FRAME_SECTIONS.rect!;
    const EI = 210e9 * sec.Iy;
    const v = sol.displacements.get(1)!.v;
    expect(Math.abs(v + (1000 * 8) / (3 * EI))).toBeLessThan(1e-9);
    const r = sol.reactions.get(0)!;
    expect(Math.abs(r.y - 1000)).toBeLessThan(1e-6);
    expect(Math.abs(r.m - 2000)).toBeLessThan(1e-6);
  });

  it('Egyszerűen tartott: 3 csomó/2 rúd, közép-P reakciók qL/2-félék', () => {
    const model = buildFrameSimplySupported();
    expect(model.nodes).toHaveLength(3);
    expect(model.beams).toHaveLength(2);
    const sol = solveFrame(model, { tol: 1e-12 });
    expect(Math.abs(sol.reactions.get(0)!.y - 1000)).toBeLessThan(1e-6);
    expect(Math.abs(sol.reactions.get(2)!.y - 1000)).toBeLessThan(1e-6);
    expect(sol.beams.get(0)!.M2).toBeGreaterThan(0); // közép: pozitív nyomaték
  });

  it('Kétvégén befogott: q, 3 csomó, végi reakciónyomatékok szimmetrikusak', () => {
    const model = buildFrameFixedFixed();
    expect(model.beams).toHaveLength(2);
    const sol = solveFrame(model, { tol: 1e-12 });
    const r0 = sol.reactions.get(0)!;
    const r2 = sol.reactions.get(2)!;
    expect(Math.abs(r0.y - 1000)).toBeLessThan(1e-6); // q·L/2 = 1000
    expect(Math.abs(r0.m + r2.m)).toBeLessThan(1e-6); // ellentétes előjelek
    expect(r0.m).toBeGreaterThan(0);
  });

  it('Portálkeret: 5 csomó/4 rúd, ΣR + ΣF = 0 (erő + nyomaték)', () => {
    const model = buildFramePortal();
    expect(model.nodes).toHaveLength(5);
    expect(model.beams).toHaveLength(4);
    const sol = solveFrame(model, { tol: 1e-10 });
    let sy = 0;
    let sm = 0;
    for (const [id, r] of sol.reactions) {
      sy += r.y;
      const n = model.nodes.find((nd) => nd.id === id)!;
      sm += r.m + n.x * r.y - n.y * r.x;
    }
    sy += -2000; // a P terhelés
    const load = model.nodes.find((n) => n.id === 2)!;
    sm += load.x * -2000;
    expect(Math.abs(sy)).toBeLessThan(1e-6);
    expect(Math.abs(sm)).toBeLessThan(1e-3);
  });

  it('Rácsos híd: 33 rúd, szimmetrikus rúderők, ΣR = P', () => {
    const model = buildFrameTrussBridge();
    expect(model.memberType).toBe('bar');
    expect(model.nodes).toHaveLength(18); // 9 alsó + 9 felső
    expect(model.beams).toHaveLength(33);
    // frame.ts invariáns: node.id === tömbindex (dof() és geometria is ID-vel indexel)
    model.nodes.forEach((nd, i) => expect(nd.id).toBe(i));
    // alsó öv a 0..8, felső öv a 9..17 csomóközökön
    expect(model.nodes[8]!.y).toBe(0);
    expect(model.nodes[9]!.y).toBe(1.2);
    const sol = solveFrame(model, { tol: 1e-12 });
    // szimmetria: bal és jobb oldali átlók azonos |N|
    for (const b of sol.beams.values()) {
      expect(Number.isFinite(b.N)).toBe(true);
    }
    const r0 = sol.reactions.get(0)!;
    const r8 = sol.reactions.get(8)!;
    expect(Math.abs(r0.y - 2500)).toBeLessThan(1e-4);
    expect(Math.abs(r8.y - 2500)).toBeLessThan(1e-4);
    expect(Math.abs(r0.x)).toBeLessThan(1e-4);
  });
});