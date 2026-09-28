/**
 * Feszültség-színtérkép: a hőtérképnek sima, egyárnyalatú átmenetet kell adnia,
 * és a feszültség-csúcsnak MINDIG ki kell ugrania a vászon hátteréből — most
 * már világos és sötét témában egyaránt.
 *
 * Két mért regressziós hiba:
 *  1. a srgbToLinear() 0–1 helyett 0–255 inputet kapott → a skála fehérre csapott;
 *  2. az egyirányú skála világos témán a csúcsot háttérbe olvasztotta
 *     (#c6e5f4 egy #eef3ff vászonon mindössze 1,19:1 kontrasztot ad).
 */

import { describe, expect, it } from 'vitest';
import { stressRgb, stressCss, stressGradientCss } from '../src/viz/colormap';

/** Oklab világosság (L) — ugyanaz a képlet, amit a modul használ */
function oklabL(r: number, g: number, b: number): number {
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const lr = lin(r), lg = lin(g), lb = lin(b);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
}

/** Relatív luminancia (WCAG) */
function luminance(r: number, g: number, b: number): number {
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** Kontrasztarány két szín között */
function contrast(a: number, b: number): number {
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

/** A két téma valós vászon-háttere (src/viz/renderer.ts) */
const THEMES = [
  { name: 'világos', dark: false, bg: [0xee, 0xf3, 0xff] as const },
  { name: 'sötét', dark: true, bg: [0x0b, 0x14, 0x24] as const },
] as const;

const N = 256;

describe.each(THEMES)('stressRgb — $name téma', ({ dark, bg }) => {
  const samples = Array.from({ length: N }, (_, i) => stressRgb(i / (N - 1), dark));
  const key = (c: { r: number; g: number; b: number }) => `${c.r},${c.g},${c.b}`;

  it('a csúcs jól kiugranak a vászon hátteréből, a nulla feszültség visszavonódik', () => {
    const bgY = luminance(bg[0], bg[1], bg[2]);
    const lo = luminance(samples[0]!.r, samples[0]!.g, samples[0]!.b);
    const hi = luminance(samples[N - 1]!.r, samples[N - 1]!.g, samples[N - 1]!.b);
    // a csúcsnak markánsan el kell válnia a háttértől (ez volt a 2. regresszió)
    expect(contrast(hi, bgY)).toBeGreaterThan(4);
    // a nulla feszültség szinte a háttérben van
    expect(contrast(lo, bgY)).toBeLessThan(1.6);
    // és a kontraszt monoton nő a feszültséggel
    for (let i = 1; i < N; i++) {
      const a = luminance(samples[i - 1]!.r, samples[i - 1]!.g, samples[i - 1]!.b);
      const b = luminance(samples[i]!.r, samples[i]!.g, samples[i]!.b);
      const ca = contrast(a, bgY);
      const cb = contrast(b, bgY);
      // megengedünk 1%-os ingadozást a kerekítés miatt
      expect(cb).toBeGreaterThan(ca * 0.99 - 0.02);
    }
  });

  it('egyárnyalatú kék, nincs szivárvány (b ≥ g ≥ r)', () => {
    for (const c of samples) {
      expect(c.b).toBeGreaterThanOrEqual(c.g);
      expect(c.g).toBeGreaterThanOrEqual(c.r);
    }
  });

  it('a világosság szigorúan monoton, a téma szerinti irányban', () => {
    // a mért régi hiba: az 5 kontrollpontos, lineáris sRGB-ben interpolált
    // skála 74 világosság-visszafordulást adott 1000 mintán.
    // Sötét háttéren a világosság nő a feszültséggel, világoson csökken —
    // mindkettő monoton, egyik sem fordul vissza.
    const steps: number[] = [];
    for (let i = 1; i < N; i++) {
      steps.push(
        oklabL(samples[i]!.r, samples[i]!.g, samples[i]!.b) -
          oklabL(samples[i - 1]!.r, samples[i - 1]!.g, samples[i - 1]!.b),
      );
    }
    const wrongDirection = dark ? steps.filter((d) => d < 0) : steps.filter((d) => d > 0);
    expect(wrongDirection).toHaveLength(0);
    expect(steps.filter((d) => (dark ? d > 0 : d < 0)).length).toBeGreaterThan(N - 4);
  });

  it('a világosság nem akadozik: a kvantálás csak elszigetelt plateaut okoz', () => {
    // 8 bites kerekítés miatt egy-két minta lehet azonos; sorozatnyi
    // azonos szín már sávkódás lenne
    expect(new Set(samples.map(key)).size).toBeGreaterThanOrEqual(N - 2);
    let run = 0;
    let maxRun = 0;
    for (let i = 1; i < N; i++) {
      run = key(samples[i]!) === key(samples[i - 1]!) ? run + 1 : 0;
      maxRun = Math.max(maxRun, run);
    }
    expect(maxRun).toBeLessThanOrEqual(2);
  });

  it('a lépések egyenletesek, és a szomszédos színek nem ugranak', () => {
    const steps: number[] = [];
    for (let i = 1; i < N; i++) {
      steps.push(Math.abs(oklabL(samples[i]!.r, samples[i]!.g, samples[i]!.b) - oklabL(samples[i - 1]!.r, samples[i - 1]!.g, samples[i - 1]!.b)));
    }
    const positive = steps.filter((d) => d > 0);
    const mean = positive.reduce((s, v) => s + v, 0) / positive.length;
    expect(Math.max(...positive) / mean).toBeLessThan(3);
    for (let i = 1; i < N; i++) {
      const a = samples[i - 1]!, b = samples[i]!;
      expect(Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b)).toBeLessThan(12);
    }
  });

  it('a tartományon kívüli és a NaN bemenetet kezeli', () => {
    expect(stressRgb(-5, dark)).toEqual(stressRgb(0, dark));
    expect(stressRgb(5, dark)).toEqual(stressRgb(1, dark));
    const nan = stressRgb(Number.NaN, dark);
    expect(Number.isFinite(nan.r + nan.g + nan.b)).toBe(true);
    expect(nan).toEqual(stressRgb(0, dark));
  });

  it('nem minden szín fehér (a 0–255/0–1 elcsúszás regressziós őre)', () => {
    expect(samples.filter((c) => c.r === 255 && c.g === 255 && c.b === 255)).toHaveLength(0);
  });
});

describe('stressRgb — a két irány egymás tükörképe', () => {
  it('világos és sötét téma ugyanazokat a színeket adja fordított sorrendben', () => {
    for (const t of [0, 0.2, 0.5, 0.8, 1]) {
      expect(stressRgb(t, true)).toEqual(stressRgb(1 - t, false));
    }
  });

  it('t=1 felé a világosság sötét témán nő, világos témán csökken', () => {
    expect(oklabL(...Object.values(stressRgb(1, true)) as [number, number, number])).toBeGreaterThan(
      oklabL(...Object.values(stressRgb(0, true)) as [number, number, number]),
    );
    expect(oklabL(...Object.values(stressRgb(1, false)) as [number, number, number])).toBeLessThan(
      oklabL(...Object.values(stressRgb(0, false)) as [number, number, number]),
    );
  });
});

describe('CSS segédek', () => {
  it.each(THEMES)('$name téma: a legenda-gradiens a skálát követi', ({ dark }) => {
    const css = stressGradientCss(64, dark);
    const stops = css.match(/rgb\(\d+,\d+,\d+\)/g) ?? [];
    expect(stops).toHaveLength(64);
    expect(stops[0]).toBe(stressCss(0, dark));
    expect(stops[63]).toBe(stressCss(1, dark));
    expect(css).toContain('linear-gradient(to right,');
  });

  it('a gr minden stropa monoton növekvő kontrasztú a háttérhez képest', () => {
    for (const { dark, bg } of THEMES) {
      const css = stressGradientCss(64, dark);
      const stops = (css.match(/rgb\((\d+),(\d+),(\d+)\)/g) ?? []).map((s) =>
        s.match(/\d+/g)!.map(Number) as [number, number, number],
      );
      const bgY = luminance(bg[0], bg[1], bg[2]);
      for (let i = 1; i < stops.length; i++) {
        expect(contrast(luminance(...stops[i]!), bgY)).toBeGreaterThanOrEqual(
          contrast(luminance(...stops[i - 1]!), bgY) * 0.99 - 0.02,
        );
      }
    }
  });
});
