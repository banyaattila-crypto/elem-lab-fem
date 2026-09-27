/**
 * Feszültség-színtérkép: a hőtérképnek sima, egyárnyalatú átmenetet kell adnia.
 *
 * A regressziós bug a srgbToLinear() 0–1 helyett 0–255 inputet kapott, így az
 * egész skála fehérre csapott (255,255,255) — ezek a tesztek ezt fogják meg.
 */

import { describe, expect, it } from 'vitest';
import { stressRgb, stressCss, stressGradientCss } from '../src/viz/colormap';

/** Oklab világosság (L) egy színből — ugyanaz a képlet, amit a modul használ */
function oklabL(r: number, g: number, b: number): number {
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const lr = lin(r);
  const lg = lin(g);
  const lb = lin(b);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
}

const N = 256;
const samples = Array.from({ length: N }, (_, i) => stressRgb(i / (N - 1)));

describe('stressRgb — végpontok', () => {
  it('a t=0 a legsötétebb, a t=1 a legvilágosabb kontrollpont', () => {
    expect(stressRgb(0)).toEqual({ r: 10, g: 24, b: 48 });
    expect(stressRgb(1)).toEqual({ r: 198, g: 229, b: 244 });
  });

  it('nem minden szín fehér (a 0–255/0–1 elcsúszás regressziós őre)', () => {
    const white = samples.filter((c) => c.r === 255 && c.g === 255 && c.b === 255);
    expect(white).toHaveLength(0);
    // és tényleg változik
    const distinct = new Set(samples.map((c) => `${c.r},${c.g},${c.b}`));
    expect(distinct.size).toBeGreaterThan(N / 2);
  });

  it('a tartományon kívüli és a NaN bemenetet kezeli', () => {
    expect(stressRgb(-5)).toEqual(stressRgb(0));
    expect(stressRgb(5)).toEqual(stressRgb(1));
    const nan = stressRgb(Number.NaN);
    expect(Number.isFinite(nan.r + nan.g + nan.b)).toBe(true);
    expect(nan).toEqual(stressRgb(0));
  });
});

describe('stressRgb — egyárnyalatú kék, nincs szivárvány', () => {
  it('minden minta a kék családba esik (b ≥ g ≥ r)', () => {
    for (const c of samples) {
      expect(c.b).toBeGreaterThanOrEqual(c.g);
      expect(c.g).toBeGreaterThanOrEqual(c.r);
    }
  });

  it('a világosság szigorúan monoton nő a feszültséggel', () => {
    for (let i = 1; i < N; i++) {
      const a = oklabL(samples[i - 1]!.r, samples[i - 1]!.g, samples[i - 1]!.b);
      const b = oklabL(samples[i]!.r, samples[i]!.g, samples[i]!.b);
      expect(b).toBeGreaterThanOrEqual(a - 1e-9);
    }
  });

  it('a világosság a teljes tartományt bejárja (nem üres skála)', () => {
    const lo = oklabL(samples[0]!.r, samples[0]!.g, samples[0]!.b);
    const hi = oklabL(samples[N - 1]!.r, samples[N - 1]!.g, samples[N - 1]!.b);
    expect(lo).toBeLessThan(0.35);
    expect(hi).toBeGreaterThan(0.85);
  });
});

describe('stressRgb — sima átmenet (nincs banding)', () => {
  it('a szomszédos minták világosság-lépése kicsi és egyenletes', () => {
    const steps: number[] = [];
    for (let i = 1; i < N; i++) {
      const a = oklabL(samples[i - 1]!.r, samples[i - 1]!.g, samples[i - 1]!.b);
      const b = oklabL(samples[i]!.r, samples[i]!.g, samples[i]!.b);
      steps.push(Math.abs(b - a));
    }
    const max = Math.max(...steps);
    const mean = steps.reduce((s, v) => s + v, 0) / steps.length;
    // nincs ugrás/kötés a kontrollpontoknál
    expect(max).toBeLessThan(0.01);
    // és nincs szaggatott, "lépcsős" karakter sem: a legnagyobb lépés
    // nem sokkal nagyobb az átlagnál
    expect(max / mean).toBeLessThan(3);
  });

  it('a szomszédos színek nem ugorhatnak nagy távolságra', () => {
    for (let i = 1; i < N; i++) {
      const a = samples[i - 1]!;
      const b = samples[i]!;
      const d = Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b);
      expect(d).toBeLessThan(12);
    }
  });
});

describe('CSS segédek', () => {
  it('stressCss a megfelelő rgb() stringet adja', () => {
    expect(stressCss(0)).toBe('rgb(10,24,48)');
    expect(stressCss(1)).toBe('rgb(198,229,244)');
  });

  it('a legenda-gradiens sok stoppos, és a végpontok egyeznek a skálával', () => {
    const css = stressGradientCss(64);
    const stops = css.match(/rgb\(\d+,\d+,\d+\)/g) ?? [];
    expect(stops).toHaveLength(64);
    expect(stops[0]).toBe(stressCss(0));
    expect(stops[63]).toBe(stressCss(1));
    // nem 10 stoppos (az sRGB-ben interpolálva bandinget adott)
    expect(css).toContain('linear-gradient(to right,');
  });

  it('a gradiens minden közbenső stropa monoton világosságú', () => {
    const css = stressGradientCss(64);
    const stops = (css.match(/rgb\((\d+),(\d+),(\d+)\)/g) ?? []).map((s) =>
      s.match(/\d+/g)!.map(Number) as [number, number, number],
    );
    for (let i = 1; i < stops.length; i++) {
      expect(oklabL(...stops[i]!)).toBeGreaterThanOrEqual(oklabL(...stops[i - 1]!) - 1e-9);
    }
  });
});
