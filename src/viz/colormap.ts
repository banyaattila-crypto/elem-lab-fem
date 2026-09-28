/**
 * Feszültség-hőtérkép színtérképe.
 *
 * Egyárnyalatú kékskála, monoton világossággal. Egyetlen árnyalat, tehát a
 * színnel nincs információverseny — a szín kizárólag a feszültség nagyságát
 * hordozza (klasszikus FEA-megjelenítés).
 *
 * Az irány TÉMAFÜGGŐ, és ennek oka van: a maximális kontraszt érdekében a
 * feszültség-csúcsnak mindig ki kell ugrania a vászon hátteréből.
 *   világos téma (vászon #eef3ff): halvány kék → mély kék   (sötét a csúcs)
 *   sötét téma   (vászon #0b1424): mély kék   → halvány kék (világos a csúcs)
 * Fordított irányban a csúcs háttérbe olvadna: világos témán a világoskék
 * eltűnik a fehér vászonon, sötét témán a mélykék a sötét háttéren.
 *
 * Az interpoláció Oklab-színtérben történik, nem sRGB-ben: így a színátmenet
 * egyenletes (a világosság szigorúan monoton, nincs lépcsők közötti
 * fényerő-ingadozás), és a Canvas 2D, a WebGL 3D, az 1D váz-render és a
 * HTML-legenda ugyanazt a skálát adja — egyetlen forrásból.
 */

import { isDarkTheme } from './theme';

/** RGB szín 0–255 tartományban */
export interface RGB {
  r: number;
  g: number;
  b: number;
}

// ————— Oklab átváltás —————

/** sRGB 0–255 → lineáris 0–1 */
function srgbToLinear(c255: number): number {
  const c = c255 / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function linearToSrgb(c: number): number {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

function rgbToOklab(r: number, g: number, b: number): [number, number, number] {
  const lr = srgbToLinear(r);
  const lg = srgbToLinear(g);
  const lb = srgbToLinear(b);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function oklabToRgb(L: number, A: number, B: number): RGB {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  const lr = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const lg = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const lb = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
  const clamp = (v: number) => Math.min(255, Math.max(0, Math.round(linearToSrgb(v) * 255)));
  return { r: clamp(lr), g: clamp(lg), b: clamp(lb) };
}

// ————— Egyárnyalatú kék lámpatörpe —————

/** Kontrollpontok t=0 (mély kék) … t=1 (halvány kék) — ez a SÖTÉT háttérhez
 *  való irány; világos háttéren a t értékét megfordítjuk, hogy a csúcs a
 *  háttértől legtávolabb eső, legsötétebb szín legyen. */
const ANCHORS: Array<[number, string]> = [
  [0.0, '#0a1830'],
  [0.125, '#10305c'],
  [0.25, '#154a8a'],
  [0.375, '#1a63b4'],
  [0.5, '#227fc9'],
  [0.625, '#3399d6'],
  [0.75, '#57b2e0'],
  [0.875, '#8ecbe9'],
  [1.0, '#c6e5f4'],
];

/** A kontrolpontok Oklab-koordinátái — egyszer kiszámítva */
const OKLAB_ANCHORS: Array<[number, number, number, number]> = ANCHORS.map(([t, hex]) => {
  const [L, A, B] = rgbToOklab(
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  );
  return [t, L, A, B];
});

/**
 * t ∈ [0,1] → szín. A t értéket a hívó normalizálja (v / vMax).
 * Oklab-ben interpolálunk, ezért a lépcsők között nincs fényerő-ugrás.
 *
 * @param t    normalizált feszültség: 0 = nulla, 1 = maximális
 * @param dark a vászon sötét hátterű-e; alapértelmezésben az aktuális téma
 *             (`isDarkTheme()`), így a renderereknek nem kell szálazgatniuk.
 */
export function stressRgb(t: number, dark = isDarkTheme()): RGB {
  const c = Number.isFinite(t) ? Math.min(1, Math.max(0, t)) : 0;
  // világos háttéren megfordítunk, hogy a csúcs a legsötétebb legyen
  const x = dark ? c : 1 - c;
  let i = 0;
  while (i < OKLAB_ANCHORS.length - 2 && x > OKLAB_ANCHORS[i + 1]![0]) i++;
  const a = OKLAB_ANCHORS[i]!;
  const b = OKLAB_ANCHORS[i + 1]!;
  const f = (x - a[0]) / (b[0] - a[0]);
  return oklabToRgb(a[1] + f * (b[1] - a[1]), a[2] + f * (b[2] - a[2]), a[3] + f * (b[3] - a[3]));
}

/** CSS szín-string (Canvas 2D fillStyle) */
export function stressCss(t: number, dark = isDarkTheme()): string {
  const { r, g, b } = stressRgb(t, dark);
  return `rgb(${r},${g},${b})`;
}

/**
 * CSS lineáris gradiens a legendához. sok stoppal, hogy a böngésző ne
 * interpoláljon sRGB-ben nagy lépésekben — így a HTML-legenda pontosan
 * követi a Canvas/WebGL skálát. Az irány a témától függ, ugyanúgy, mint a
 * rajzolt hőtérképé.
 */
export function stressGradientCss(stops = 64, dark = isDarkTheme()): string {
  const n = Math.max(2, stops);
  const parts: string[] = [];
  for (let i = 0; i < n; i++) parts.push(stressCss(i / (n - 1), dark));
  return `linear-gradient(to right, ${parts.join(',')})`;
}
