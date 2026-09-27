/**
 * Színtérkép feszültség-hőtérképhez.
 * Viridis-szerű, színvakság-barát paletta (kék → zöld → sárga).
 */

/** RGB szín 0–255 tartományban */
export interface RGB {
  r: number;
  g: number;
  b: number;
}

/** Viridis kontrolpontok (t: 0..1) */
const VIRIDIS: Array<{ t: number; c: RGB }> = [
  { t: 0.0, c: { r: 68, g: 1, b: 84 } },
  { t: 0.25, c: { r: 59, g: 82, b: 139 } },
  { t: 0.5, c: { r: 33, g: 145, b: 140 } },
  { t: 0.75, c: { r: 94, g: 201, b: 98 } },
  { t: 1.0, c: { r: 253, g: 231, b: 37 } },
];

/**
 * t ∈ [0,1] → viridis szín.
 * A feszültségértékeket előtte normalizálni kell (v / vMax).
 */
export function viridis(t: number): RGB {
  const x = Math.min(1, Math.max(0, t));
  for (let i = 0; i < VIRIDIS.length - 1; i++) {
    const a = VIRIDIS[i]!;
    const b = VIRIDIS[i + 1]!;
    if (x >= a.t && x <= b.t) {
      const f = (x - a.t) / (b.t - a.t);
      return {
        r: Math.round(a.c.r + f * (b.c.r - a.c.r)),
        g: Math.round(a.c.g + f * (b.c.g - a.c.g)),
        b: Math.round(a.c.b + f * (b.c.b - a.c.b)),
      };
    }
  }
  return VIRIDIS[VIRIDIS.length - 1]!.c;
}

/** CSS szín-string */
export function viridisCss(t: number): string {
  const { r, g, b } = viridis(t);
  return `rgb(${r},${g},${b})`;
}
