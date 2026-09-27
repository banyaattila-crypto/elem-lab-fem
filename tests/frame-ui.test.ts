/**
 * Váz-UI réteg smoke-tesztjei: a builder → solveFrame → N/M/V minta és a
 * rúd/csomópont `inspect` adatvezetéke a verifikált megoldóra épülve
 * (DOM nélkül, csak a tiszta adathalmazt ellenőrzi).
 */

import { describe, expect, it } from 'vitest';
import { solveFrame } from '../src/fem/frame';
import {
  buildFrameCantilever,
  buildFramePortal,
  buildFrameTrussBridge,
} from '../src/models/frames';
import { sampleFrameDiagrams } from '../src/viz/frame-panel';
import { inspectFrameElement, inspectFrameNode } from '../src/ui/frameinspect';

function rel(a: number, b: number, tol = 1e-6): void {
  expect(Math.abs(a - b)).toBeLessThan(Math.max(Math.abs(b), 1e-12) * tol);
}

/** rect 20×400 mm szelvény értékei (FRAME_SECTIONS.rect) */
const A = 0.02 * 0.4;
const I = (0.02 * 0.4 ** 3) / 12;
const Wy = 0.02 * 0.4 ** 2 / 6;

describe('váz-UI adatréteg', () => {
  it('konzol: inspect rúd → N, M1=V1·0? és σ a visszanyerésből', () => {
    const model = buildFrameCantilever({ loadN: 1000, loadType: 'point' });
    const sol = solveFrame(model, { tol: 1e-12 });
    const insp = inspectFrameElement(model, sol, 0);

    expect(insp.L).toBeCloseTo(2, 9);
    expect(insp.A).toBeCloseTo(A, 12);
    expect(insp.I).toBeCloseTo(I, 18);
    expect(insp.W).toBeCloseTo(Wy, 18);
    rel(insp.N, 0); // tiszta hajlítás a konzolon
    rel(insp.M1, -1000 * 2, 1e-9);
    rel(insp.V1, 1000, 1e-9);
    // szélsőszál-feszültség: |M|/W = 2000/5.333e-4 ≈ 3.75 MPa
    rel(insp.sigmaTop, 2000 / Wy, 1e-6);
    rel(insp.sigmaBot, 2000 / Wy, 1e-6);
  });

  it('konzol: inspect csomópont → befogási reakciók (0, +P, +P·L)', () => {
    const model = buildFrameCantilever({ loadN: 1000 });
    const sol = solveFrame(model, { tol: 1e-12 });
    const insp = inspectFrameNode(model, sol, 0);

    rel(insp.rx, 0, 1e-9);
    rel(insp.ry, 1000, 1e-9);
    rel(insp.m, 2000, 1e-9);
    rel(insp.u, 0, 1e-9);
    rel(insp.v, 0, 1e-9);
    expect(insp.supportKind).toContain('befogott');
  });

  it('konzol: N/M/V panel mintái a rúdkiosztás mentén', () => {
    const model = buildFrameCantilever({ loadN: 1000 });
    const sol = solveFrame(model, { tol: 1e-12 });
    const samples = sampleFrameDiagrams(model, sol);

    expect(samples.length).toBeGreaterThan(2);
    expect(samples[0]!.arc).toBeCloseTo(0, 9);
    expect(samples[samples.length - 1]!.arc).toBeCloseTo(2, 9);
    for (const s of samples) {
      rel(s.N, 0, 1e-6);
      rel(s.V, 1000, 1e-6); // konzolon a V állandó P
    }
    // M lineárisan esik: a szabad végnél 0 → intervallum élei illeszkednek
    expect(samples[samples.length - 1]!.M).toBeLessThan(1e-9);
  });

  it('portálkeret: teljes ívhossz és a függőleges egyensúly', () => {
    const model = buildFramePortal({ loadN: 2000 });
    const sol = solveFrame(model, { tol: 1e-12 });
    const samples = sampleFrameDiagrams(model, sol);
    // 2×2 m láb + 4 m gerenda = 8 m
    expect(samples[samples.length - 1]!.arc).toBeCloseTo(8, 9);

    const i0 = inspectFrameNode(model, sol, 0);
    const i4 = inspectFrameNode(model, sol, 4);
    rel(i0.ry + i4.ry, 2000, 1e-6);
    expect(Math.abs(i0.rx + i4.rx)).toBeLessThan(1e-6); // nulla → abszolút
  });

  it('rácsos híd: a középső alsó P-nél a panel-minták monoton ívhosszt adnak', () => {
    const model = buildFrameTrussBridge({ loadN: 5000 });
    const sol = solveFrame(model, { tol: 1e-10 });
    const samples = sampleFrameDiagrams(model, sol);
    expect(samples.length).toBeGreaterThan(5);
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i]!.arc).toBeGreaterThanOrEqual(samples[i - 1]!.arc - 1e-9);
    }
    // rúd-inspect a 0. rúdon (alsó öv, id 0→1): L = 1 m mező
    const insp = inspectFrameElement(model, sol, 0);
    expect(insp.L).toBeCloseTo(1, 9);
    // külső alsó öv húzott (Pratt, középen P): N∞P-részarányú, véges
    expect(Math.abs(insp.N)).toBeGreaterThan(1000);
    expect(Math.abs(insp.N)).toBeLessThan(5000);
  });
});