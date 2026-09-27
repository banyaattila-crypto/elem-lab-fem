/**
 * MathPanel T6-támogatás: az elemvizsgálatnak a kvadratikus elem
 * valós adataival kell dolgoznia, nem a sarok-háromszög CST-értékeivel.
 *
 * A legfontosabb ellenőrzés: a panel által mutatott kₑ és σ pontosan az,
 * amit a szolver használ (t6Stiffness / t6Stress), és az ε = B̄·uₑ
 * azonosság pontosan teljesül.
 */

import { describe, expect, it } from 'vitest';
import { inspectElement } from '../src/ui/mathpanel';
import { renderInspection } from '../src/ui/mathpanel-view';
import { t6Geometry, t6Stiffness, t6Stress } from '../src/fem/t6';
import { constitutiveMatrix } from '../src/fem/cst';
import { buildCantilever } from '../src/models/cantilever';
import { convertToT6 } from '../src/models/t6convert';
import { solve } from '../src/fem/solve';
import type { Mesh, Node, SolutionResult } from '../src/fem/types';

const OPTS = { L: 2, H: 0.4, thickness: 0.02, loadN: 1000, density: 2 };

function solved(mesh: Mesh): SolutionResult {
  return solve(mesh);
}

describe('inspectElement — T6', () => {
  it('a háló elemtípusát felismeri, nem a sarok-háromszöget számolja', () => {
    const mesh = convertToT6(buildCantilever(OPTS));
    const sol = solved(mesh);
    const insp = inspectElement(mesh, sol, 0);

    expect(insp.elementType).toBe('T6');
    expect(insp.coords).toHaveLength(6);
    expect(insp.uElem).toHaveLength(12);
    expect(insp.ke).toHaveLength(12);
    expect(insp.ke[0]).toHaveLength(12);
    expect(insp.B).toHaveLength(3);
    expect(insp.B[0]).toHaveLength(12);
    expect(insp.gauss).toHaveLength(3);
    expect(insp.natural).toHaveLength(6);
  });

  it('a mutatott kₑ megegyezik a szolver t6Stiffness eredményével', () => {
    const mesh = convertToT6(buildCantilever(OPTS));
    const sol = solved(mesh);
    const insp = inspectElement(mesh, sol, 0);

    const elem = mesh.elements.find((e) => e.id === 0)!;
    const pts = elem.nodes.map((n) => mesh.nodes[n]!) as [Node, Node, Node, Node, Node, Node];
    const g = t6Geometry(pts);
    const D = constitutiveMatrix(mesh.material, mesh.type);
    const ref = t6Stiffness(g, D, mesh.thickness);

    for (let i = 0; i < 12; i++) {
      for (let j = 0; j < 12; j++) {
        // relatív összehasonlítás: a merevségi mátrix nagyságrendje 1e9
        expect(insp.ke[i]![j]!).toBeCloseTo(ref[i]![j]!, 4);
      }
    }
  });

  it('a mutatott σ megegyezik a szolver t6Stress Gauss-átlagával', () => {
    const mesh = convertToT6(buildCantilever(OPTS));
    const sol = solved(mesh);
    const insp = inspectElement(mesh, sol, 0);

    const elem = mesh.elements.find((e) => e.id === 0)!;
    const pts = elem.nodes.map((n) => mesh.nodes[n]!) as [Node, Node, Node, Node, Node, Node];
    const g = t6Geometry(pts);
    const D = constitutiveMatrix(mesh.material, mesh.type);
    const ref = t6Stress(g, D, insp.uElem);

    // Pa nagyságrendben, 6 tizedesre
    expect(insp.sigma[0]).toBeCloseTo(ref.sigmaX, 6);
    expect(insp.sigma[1]).toBeCloseTo(ref.sigmaY, 6);
    expect(insp.sigma[2]).toBeCloseTo(ref.tauXY, 6);
  });

  it('ε = B̄·uₑ pontosan (a súlyozott B-átlag miatt)', () => {
    const mesh = convertToT6(buildCantilever(OPTS));
    const sol = solved(mesh);
    const insp = inspectElement(mesh, sol, 0);

    for (let i = 0; i < 3; i++) {
      let acc = 0;
      for (let j = 0; j < 12; j++) acc += insp.B[i]![j]! * insp.uElem[j]!;
      expect(acc).toBeCloseTo(insp.eps[i]!, 12);
    }
  });

  it('σ = D·ε pontosan (az átlagos B definíciójából)', () => {
    const mesh = convertToT6(buildCantilever(OPTS));
    const sol = solved(mesh);
    const insp = inspectElement(mesh, sol, 0);

    for (let i = 0; i < 3; i++) {
      let acc = 0;
      for (let j = 0; j < 3; j++) acc += insp.D[i]![j]! * insp.eps[j]!;
      // a feszültségek ~1e8 Pa nagyságrendben, 1e-8 relatív
      expect(acc / insp.sigma[i]!).toBeCloseTo(1, 8);
    }
  });

  it('a Gauss-pontok adatai konzisztensek (Σw·detJ = elemterület)', () => {
    const mesh = convertToT6(buildCantilever(OPTS));
    const sol = solved(mesh);
    const insp = inspectElement(mesh, sol, 0);

    const area = insp.gauss!.reduce((s, g) => s + g.w * g.detJ, 0);
    expect(area).toBeCloseTo(insp.area, 12);
    // a középcsúcsok valóban az élek felezői
    for (let i = 0; i < 3; i++) {
      const a = insp.coords[i]!;
      const b = insp.coords[(i + 1) % 3]!;
      const m = insp.coords[3 + i]!;
      expect(m.x).toBeCloseTo((a.x + b.x) / 2, 12);
      expect(m.y).toBeCloseTo((a.y + b.y) / 2, 12);
    }
  });
});

describe('inspectElement — CST nem regresszió', () => {
  it('CST hálón továbbra is 6 DOF és 6×6 merevség', () => {
    const mesh = buildCantilever(OPTS);
    const sol = solved(mesh);
    const insp = inspectElement(mesh, sol, 0);

    expect(insp.elementType).toBe('CST');
    expect(insp.coords).toHaveLength(3);
    expect(insp.uElem).toHaveLength(6);
    expect(insp.ke).toHaveLength(6);
    expect(insp.B[0]).toHaveLength(6);
    expect(insp.gauss).toBeUndefined();
    expect(insp.natural).toBeUndefined();
  });

  it('T6-nál a panel eredménye NEM egyezik meg a sarok-CST-vel (ez volt a hiba)', () => {
    const meshCST = buildCantilever(OPTS);
    const meshT6 = convertToT6(buildCantilever(OPTS));
    const solT6 = solved(meshT6);

    // a sarok-háromszögre számolt CST (a régi hibás viselkedés)
    const corner = inspectElement(meshCST, solved(meshCST), 0);
    const full = inspectElement(meshT6, solT6, 0);

    // más méretű mátrix, tehát más eredmény — a hiba nem maradhat rejtve
    expect(full.ke).toHaveLength(12);
    expect(corner.ke).toHaveLength(6);
    // a feszültségük is különbözik (a középcsúcsok elmozdulásai is beleszámítanak)
    expect(full.sigma[0]).not.toBeCloseTo(corner.sigma[0], 3);
  });
});

describe('MathPanel nézet — T6', () => {
  it('magyarul és angolul is renderel T6-ot, NaN nélkül', () => {
    const mesh = convertToT6(buildCantilever(OPTS));
    const sol = solved(mesh);
    const insp = inspectElement(mesh, sol, 0);

    for (const lang of ['hu', 'en'] as const) {
      const html = renderInspection(insp, lang);
      expect(html).not.toContain('NaN');
      expect(html).not.toContain('undefined');
      expect(html).toContain('mp-section');
      // a Gauss-pont táblázata is megjelenik
      expect(html).toContain('mp-table');
    }
    // a 12×12-es merevség címkéje T6-nál
    expect(renderInspection(insp, 'hu')).toContain('12×12');
  });

  it('CST-nél a 6×6-os felirat marad, és nincs Gauss-táblázat', () => {
    const mesh = buildCantilever(OPTS);
    const sol = solved(mesh);
    const insp = inspectElement(mesh, sol, 0);
    const html = renderInspection(insp, 'hu');

    expect(html).toContain('6×6');
    expect(html).not.toContain('mp-table');
    expect(html).not.toContain('NaN');
  });
});
