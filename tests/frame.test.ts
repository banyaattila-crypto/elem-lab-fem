/**
 * Váz-mag (1D rúd/rács) analitikus verifikációja — a terv 11. fejezetének
 * benchmark-táblázata. Relatív tolerancia: 10⁻⁹ direkt / 10⁻⁶ CG-vel.
 *
 * Referenciák:
 *  1 Konzol, végponti P     v_tip = PL³/3EI
 *  2 Konzol, végponti P     M(befogás) = −PL
 *  3 Konzol, egyenletes q   v_tip = qL⁴/8EI, M = −qL²/2, V(0) = qL
 *  4 SS, középső P          v_mid = PL³/48EI, M = PL/4
 *  5 SS, egyenletes q       v_mid = 5qL⁴/384EI, M = qL²/8, V_vég = ±qL/2
 *  6 FF, egyenletes q       M_vég = −qL²/12, M_közép = qL²/24, v = qL⁴/384EI
 *  7 45°-os ferde gerenda   transzformáció-konzisztencia
 *  8 Rács (háromszög)       rúderők csomóponti módszerrel
 *  9 Erőegyensúly           ΣR + ΣF = 0
 * 10 Merevtest              zéró energia
 * 11 Rugó-támaszú konzol    v = P/(3EI/L³ + k)
 * 12 Meglévő CST-tesztek    változatlanok (a teljes szvit külön fut)
 */

import { describe, expect, it } from 'vitest';
import { solveFrame, type FrameMaterial, type FrameModel } from '../src/fem/frame';
import { beamStiffnessLocal } from '../src/fem/frame';

/** Relatív összehasonlítás (tol relatív lépés) */
function approx(a: number, b: number, rel = 1e-6): void {
  const denom = Math.max(Math.abs(b), 1e-12);
  expect(Math.abs(a - b)).toBeLessThan(denom * rel);
}

/** Állandó teszt-anyag (acél) */
function steel(): FrameMaterial {
  return { name: 'S235 acél', E: 210e9, nu: 0.3, rho: 7850, fy: 235e6 };
}

/** Téglalap szekció */
function rect(b: number, h: number, id = 'r'): FrameModel['sections'][string] {
  return { id, name: `${b}m × ${h}m`, A: b * h, Iy: (b * h * h * h) / 12, Wy: (b * h * h) / 6, h, b };
}

/** Alap vizsgált szekció: b = 20 mm, h = 400 mm */
const S = rect(0.02, 0.4, 'S');
const EI = 210e9 * S.Iy; // EI = 2.24e7 Pa·m⁴

/** Konzol modell építése (elismert: node0 = befogás) */
function cantilever(L: number, opts: { qOrP?: 'q' | 'P'; loadN?: number; springK?: number } = {}): FrameModel {
  const model: FrameModel = {
    memberType: 'beam',
    nodes: [
      { id: 0, x: 0, y: 0 },
      { id: 1, x: L, y: 0 },
    ],
    beams: [{ id: 0, nodeI: 0, nodeJ: 1, sectionId: S.id }],
    supports: [{ nodeId: 0, kind: 'fixed' }],
    pointLoads: [],
    distLoads: [],
    sections: { [S.id]: S },
    material: steel(),
  };
  const P = opts.loadN ?? 1000;
  if (opts.springK) model.supports.push({ nodeId: 1, kind: 'spring', kY: opts.springK });
  if ((opts.qOrP ?? 'P') === 'P') {
    model.pointLoads.push({ nodeId: 1, fx: 0, fy: -P });
  } else {
    model.distLoads.push({ beamId: 0, qy: -P / L });
  }
  return model;
}

/** Kételemű modell középső csomóponttal (SS / FF) */
function twoSpan(L: number, opts: { fixBoth?: boolean; loadN?: number } = {}): FrameModel {
  const qCount = opts.loadN ?? 2000;
  const fixBoth = opts.fixBoth ?? false;
  const model: FrameModel = {
    memberType: 'beam',
    nodes: [
      { id: 0, x: 0, y: 0 },
      { id: 1, x: L / 2, y: 0 },
      { id: 2, x: L, y: 0 },
    ],
    beams: [
      { id: 0, nodeI: 0, nodeJ: 1, sectionId: S.id },
      { id: 1, nodeI: 1, nodeJ: 2, sectionId: S.id },
    ],
    supports: fixBoth
      ? [{ nodeId: 0, kind: 'fixed' }, { nodeId: 2, kind: 'fixed' }]
      : [{ nodeId: 0, kind: 'pin' }, { nodeId: 2, kind: 'rollerY' }],
    pointLoads: [],
    distLoads: [],
    sections: { [S.id]: S },
    material: steel(),
  };
  // Elosztott terhelés mindkét félen (q = loadN/L), a konzisztens vektor egzakt
  model.distLoads.push({ beamId: 0, qy: -qCount / L }, { beamId: 1, qy: -qCount / L });
  return model;
}

describe('Váz-mag — Euler–Bernoulli rúd', () => {
  it('1/2. Konzol, végponti P: v_tip = PL³/3EI, M(befogás) = −PL, V = P, reakció', () => {
    const L = 2;
    const P = 1000;
    const sol = solveFrame(cantilever(L, { loadN: P }), { tol: 1e-12 });

    const vTip = sol.displacements.get(1)!.v;
    approx(vTip, -(P * L * L * L) / (3 * EI));

    const beam = sol.beams.get(0)!;
    approx(beam.M1, -P * L, 1e-9); // sagging szerint negatív (felfelé ívelt zóna)
    approx(beam.M2, 0, 1e-9);
    approx(beam.V1, P, 1e-9);
    approx(beam.V2, P, 1e-9);

    // Reakció: a befogás +P-t tart felfelé, +P·L-t visszafelé (CCW)
    const r = sol.reactions.get(0)!;
    approx(r.x, 0, 1e-9);
    approx(r.y, P, 1e-9);
    approx(r.m, P * L, 1e-9);
  });

  it('3. Konzol, egyenletes q: v_tip = qL⁴/8EI, M = −qL²/2, V(0) = qL', () => {
    const L = 2;
    const Q = 1000; // q [N/m]
    const sol = solveFrame(cantilever(L, { qOrP: 'q', loadN: Q * L }), { tol: 1e-12 });

    const vTip = sol.displacements.get(1)!.v;
    approx(vTip, -(Q * L ** 4) / (8 * EI), 1e-9);

    const beam = sol.beams.get(0)!;
    approx(beam.M1, -(Q * L * L) / 2, 1e-9);
    approx(beam.V1, Q * L, 1e-9);
    // Lineáris nyírás: V(x) = q(L−x) → a szabad végnél 0 (nincs koncentrált erő)
    expect(Math.abs(beam.V2)).toBeLessThan(1e-9);

    // Belső pontosság: a mező közepén M = −q·(L/2)²/2 = −qL²/8
    const mid = beam.samples.find((s) => Math.abs(s.s - L / 2) < 1e-9)!;
    approx(mid.M, -(Q * L * L) / 8, 1e-9);
  });

  it('4. SS, középső P: v_mid = PL³/48EI, M_mid = PL/4, V = ±P/2', () => {
    const L = 4;
    const P = 2000;
    const model = twoSpan(L);
    // Pontterhelés a középső csomóponton
    model.pointLoads.push({ nodeId: 1, fx: 0, fy: -P });
    model.distLoads = [];
    const sol = solveFrame(model, { tol: 1e-12 });

    approx(sol.displacements.get(1)!.v, -(P * L * L * L) / (48 * EI), 1e-9);

    approx(sol.beams.get(0)!.M2, (P * L) / 4, 1e-9); // bal fél vége (a csomópontnál)
    approx(sol.beams.get(1)!.M1, (P * L) / 4, 1e-9);
    approx(sol.beams.get(0)!.V1, P / 2, 1e-9);
    approx(sol.beams.get(0)!.V2, P / 2, 1e-9);
    approx(sol.beams.get(1)!.V1, -P / 2, 1e-9);
    approx(sol.beams.get(1)!.V2, -P / 2, 1e-9);

    const r0 = sol.reactions.get(0)!;
    const r2 = sol.reactions.get(2)!;
    approx(r0.y, P / 2, 1e-9);
    approx(r2.y, P / 2, 1e-9);
  });

  it('5. SS, egyenletes q: v_mid = 5qL⁴/384EI, M_mid = qL²/8, V_vég = ±qL/2', () => {
    const L = 4;
    const Q = 500; // q [N/m]
    const model = twoSpan(L, { loadN: Q * L });
    const sol = solveFrame(model, { tol: 1e-12 });

    approx(sol.displacements.get(1)!.v, -(5 * Q * L ** 4) / (384 * EI), 1e-9);

    // M_közép a bal elem végén (= M2), M_qL²/8
    approx(sol.beams.get(0)!.M2, (Q * L * L) / 8, 1e-9);
    approx(sol.beams.get(1)!.M1, (Q * L * L) / 8, 1e-9);

    approx(sol.beams.get(0)!.V1, (Q * L) / 2, 1e-9);
    approx(sol.beams.get(1)!.V2, -(Q * L) / 2, 1e-9);

    // Reakciók fel: qL/2-féle
    approx(sol.reactions.get(0)!.y, (Q * L) / 2, 1e-9);
    approx(sol.reactions.get(2)!.y, (Q * L) / 2, 1e-9);
  });

  it('6. FF, egyenletes q: M_vég = −qL²/12, M_közép = qL²/24, v = qL⁴/384EI', () => {
    const L = 4;
    const Q = 500;
    const model = twoSpan(L, { fixBoth: true, loadN: Q * L });
    const sol = solveFrame(model, { tol: 1e-12 });

    approx(sol.displacements.get(1)!.v, -(Q * L ** 4) / (384 * EI), 1e-9);

    // Végi befogási nyomatékok (sagging) negatívak
    approx(sol.beams.get(0)!.M1, -(Q * L * L) / 12, 1e-9);
    approx(sol.beams.get(1)!.M2, -(Q * L * L) / 12, 1e-9);
    // A mező közepén a nyomaték mező-sebesen pozitívra fordul
    approx(sol.beams.get(0)!.M2, (Q * L * L) / 24, 1e-9);
    approx(sol.beams.get(1)!.M1, (Q * L * L) / 24, 1e-9);

    // Reakciók 4 részletben: függőleges + nyomaték
    const r0 = sol.reactions.get(0)!;
    const r2 = sol.reactions.get(2)!;
    approx(r0.y, (Q * L) / 2, 1e-9);
    approx(r2.y, (Q * L) / 2, 1e-9);
    approx(r0.m, (Q * L * L) / 12, 1e-9); // bal befogás CCW
    approx(r2.m, -(Q * L * L) / 12, 1e-9); // jobb befogás CW
  });

  it('7. 45°-os ferde gerenda: a transzformáció konzisztens (lokális v_tip = PL³/3EI)', () => {
    const L = 2;
    const P = 1000; // a terhelés nagysága a lokális keresztirányban
    // 45°-os rúd: (0,0) → (L·√2/2, L·√2/2)
    const c = Math.SQRT1_2;
    const s = Math.SQRT1_2;
    const model: FrameModel = {
      memberType: 'beam',
      nodes: [
        { id: 0, x: 0, y: 0 },
        { id: 1, x: L * c, y: L * s },
      ],
      beams: [{ id: 0, nodeI: 0, nodeJ: 1, sectionId: S.id }],
      supports: [{ nodeId: 0, kind: 'fixed' }],
      pointLoads: [{ nodeId: 1, fx: P * s, fy: -P * c }], // lokális −y irány
      distLoads: [],
      sections: { [S.id]: S },
      material: steel(),
    };
    const sol = solveFrame(model, { tol: 1e-12 });

    const tip = sol.displacements.get(1)!;
    // A globális elmozdulást visszavetítjük a lokális tengelyekre
    const vLoc = -s * tip.u + c * tip.v; // e_y · d
    const uLoc = c * tip.u + s * tip.v;
    approx(vLoc, -(P * L * L * L) / (3 * EI), 1e-9);
    approx(uLoc, 0, 1e-9);
    // A forgás a globális tengely körül azonos a lokálissal (T a θ-t változatlan)
    approx(tip.theta, -(P * L * L) / (2 * EI), 1e-9);
  });

  it('10. Merevtest: zéró energia (K·d_rigid = 0, elmozdulás nélküli tehermentes megoldás)', () => {
    const L = 3;
    // Merev eltolás: mindkét csomópont bx u = 1, v = 0, θ = 0
    const k = beamStiffnessLocal(L, 210e9, 0.008, S.Iy);
    const dRigid = [1, 0, 0, 1, 0, 0];
    const fRigid = k.map((row) => row.reduce((acc, v, j) => acc + v * dRigid[j]!, 0));
    for (const f of fRigid) expect(Math.abs(f)).toBeLessThan(1e-9);
    // Merev elfordulás az i pont körül: u = −yθ → 0 a vízszintes rúdnál, v = xθ
    const theta = 1;
    const dRot = [0, 0, theta, 0, L * theta, theta];
    const fRot = k.map((row) => row.reduce((acc, v, j) => acc + v * dRot[j]!, 0));
    for (const f of fRot) expect(Math.abs(f)).toBeLessThan(1e-9);

    // Tehermentes, szabad (támasz nélküli) rúd: a CG nullát ad (b = 0)
    const free: FrameModel = {
      memberType: 'beam',
      nodes: [
        { id: 0, x: 0, y: 0 },
        { id: 1, x: L, y: 0 },
      ],
      beams: [{ id: 0, nodeI: 0, nodeJ: 1, sectionId: S.id }],
      supports: [],
      pointLoads: [],
      distLoads: [],
      sections: { [S.id]: S },
      material: steel(),
    };
    const sol = solveFrame(free);
    expect(sol.maxDisplacement).toBeLessThan(1e-12);
  });

  it('11. Rugó-támaszú konzol: v_tip = P/(3EI/L³ + k), a rugó felfelé tart', () => {
    const L = 2;
    const P = 1000;
    const k = 1e7;
    const model = cantilever(L, { loadN: P, springK: k });
    const sol = solveFrame(model, { tol: 1e-12 });

    const expected = -P / (3 * EI / (L * L * L) + k);
    approx(sol.displacements.get(1)!.v, expected, 1e-9);

    // A rugó reakciója felfelé hat (−k·v), a befogás felveszi a különbséget
    const rCant = sol.reactions.get(0)!;
    const rSpring = sol.reactions.get(1)!;
    approx(rSpring.y, -k * expected, 1e-9);
    approx(rCant.y + rSpring.y, P, 1e-9); // teljes egyensúly
    // Feltámasztó nyomaték a befogásnál: a vészlift és a terhelés karja (L) szerint
    approx(rCant.m, (P - rSpring.y) * L, 1e-9);
  });
});

describe('Váz-mag — rács (bar) és egyensúly', () => {
  it('8. Háromszög-rács: rúderők a csomóponti módszerrel', () => {
    const P = 1000;
    const model: FrameModel = {
      memberType: 'bar',
      nodes: [
        { id: 0, x: 0, y: 0 }, // A
        { id: 1, x: 4, y: 0 }, // B
        { id: 2, x: 2, y: 1.5 }, // C (csúcs)
      ],
      beams: [
        { id: 0, nodeI: 0, nodeJ: 1, sectionId: S.id }, // AB (alsó öv)
        { id: 1, nodeI: 0, nodeJ: 2, sectionId: S.id }, // AC
        { id: 2, nodeI: 1, nodeJ: 2, sectionId: S.id }, // BC
      ],
      supports: [
        { nodeId: 0, kind: 'pin' },
        { nodeId: 1, kind: 'rollerY' },
      ],
      pointLoads: [{ nodeId: 2, fx: 0, fy: -P }],
      distLoads: [],
      sections: { [S.id]: S },
      material: steel(),
    };
    const sol = solveFrame(model, { tol: 1e-12 });

    // Csomóponti módszer:
    //  - C csúcs: 2·F·0.6 = P → F_AC = F_BC = −P/(2·0.6) = −833.33 N (nyomás)
    //  - A: az öv egyensúlya → F_AB = −F_AC·0.8 = +666.67 N (húzás)
    const F = -P / 1.2;
    approx(sol.beams.get(1)!.N, F, 1e-9);
    approx(sol.beams.get(2)!.N, F, 1e-9);
    approx(sol.beams.get(0)!.N, -F * 0.8, 1e-9);

    // Reakciók: A és B függőlegesen +P/2-féle, A vízszintese nulla (szimmetria)
    const rA = sol.reactions.get(0)!;
    const rB = sol.reactions.get(1)!;
    approx(rA.y, P / 2, 1e-9);
    approx(rB.y, P / 2, 1e-9);
    expect(Math.abs(rA.x)).toBeLessThan(1e-9);
  });

  it('9. Erőegyensúly: ΣR + ΣF = 0 (erő- és nyomaték-síkban)', () => {
    // Kis portál: 2 oszlop + gerenda, középső pontterhelés
    const P = 2000;
    const W = 4;
    const H = 2;
    const model: FrameModel = {
      memberType: 'beam',
      nodes: [
        { id: 0, x: 0, y: 0 },
        { id: 1, x: 0, y: H },
        { id: 2, x: W / 2, y: H },
        { id: 3, x: W, y: H },
        { id: 4, x: W, y: 0 },
      ],
      beams: [
        { id: 0, nodeI: 0, nodeJ: 1, sectionId: S.id },
        { id: 1, nodeI: 1, nodeJ: 2, sectionId: S.id },
        { id: 2, nodeI: 2, nodeJ: 3, sectionId: S.id },
        { id: 3, nodeI: 4, nodeJ: 3, sectionId: S.id },
      ],
      supports: [
        { nodeId: 0, kind: 'fixed' },
        { nodeId: 4, kind: 'fixed' },
      ],
      pointLoads: [{ nodeId: 2, fx: 0, fy: -P }],
      distLoads: [],
      sections: { [S.id]: S },
      material: steel(),
    };
    const sol = solveFrame(model, { tol: 1e-10 });

    let sx = 0;
    let sy = 0;
    let sm = 0;
    for (const [nodeId, r] of sol.reactions) {
      sx += r.x;
      sy += r.y;
      const n = model.nodes.find((nd) => nd.id === nodeId)!;
      sm += r.m + n.x * r.y - n.y * r.x; // a reakció nyomatéka a z-tengelyre (m = x·fy − y·fx)
    }
    // a terhelés (0, −P) node2-n: m = x·(−P) − y·0 = −P·W/2
    const loadNode = model.nodes.find((n) => n.id === 2)!;
    sx += 0;
    sy += -P;
    sm += loadNode.x * -P - loadNode.y * 0;

    expect(Math.abs(sx)).toBeLessThan(1e-6);
    expect(Math.abs(sy)).toBeLessThan(1e-6);
    expect(Math.abs(sm)).toBeLessThan(1e-3);
  });
});