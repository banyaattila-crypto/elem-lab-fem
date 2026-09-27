/**
 * Elem-kiválasztás (picking) a canvason.
 * A képernyő-koordinátákat vissza kell transzformálni világkoordinátákra,
 * majd a tartalmazó háromszöget megkeresni. Tiszta függvények → tesztelhető.
 */

import type { Mesh } from '../fem/types';

/** A renderer által használt világ→képernyő transzformáció paraméterei */
export interface ViewTransform {
  pad: number;
  scale: number;
  minX: number;
  /** canvas magassága [px] — az Y-tengely tükrözéséhez kell */
  canvasHeight: number;
}

/**
 * Képernyő-koordináta → világ-koordináta.
 * A renderer transzformációjának pontos inverze:
 *   sx = pad + (dx − minX)·scale ; sy = height − pad − (dy − minY)·scale
 */
export function screenToWorld(
  sx: number,
  sy: number,
  t: ViewTransform,
  minY: number,
): { x: number; y: number } {
  return {
    x: t.minX + (sx - t.pad) / t.scale,
    y: minY + (t.canvasHeight - t.pad - sy) / t.scale,
  };
}

/** Pont-tartalmazás háromszögben (bária centrikus / előjeles területek módszere) */
export function pointInTriangle(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
): boolean {
  const d1 = sign(px, py, ax, ay, bx, by);
  const d2 = sign(px, py, bx, by, cx, cy);
  const d3 = sign(px, py, cx, cy, ax, ay);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
}

function sign(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  return (px - bx) * (ay - by) - (ax - bx) * (py - by);
}

/**
 * Megkeresi a pontot tartalmazó elem id-ját (vagy null, ha nincs).
 * Először DEFORMÁLATLAN geometrián próbálkozik (ergonomikus),
 */
export function findElementAt(
  mesh: Mesh,
  wx: number,
  wy: number,
): number | null {
  for (const elem of mesh.elements) {
    const p1 = mesh.nodes[elem.nodes[0]!]!;
    const p2 = mesh.nodes[elem.nodes[1]!]!;
    const p3 = mesh.nodes[elem.nodes[2]!]!;
    if (
      pointInTriangle(wx, wy, p1.x, p1.y, p2.x, p2.y, p3.x, p3.y)
    ) {
      return elem.id;
    }
  }
  return null;
}

/**
 * Megkeresi a ponthoz legközelebbi csomópontot, ha az `tolerance` világegység
 *Sugarú körön belül van. Kattintás-ergonómia: a csomópont elsőbbséget élvez.
 */
export function findNodeAt(
  mesh: Mesh,
  wx: number,
  wy: number,
  tolerance: number,
): number | null {
  let best: number | null = null;
  let bestDist = tolerance;
  for (const n of mesh.nodes) {
    const d = Math.hypot(n.x - wx, n.y - wy);
    if (d <= bestDist) {
      bestDist = d;
      best = n.id;
    }
  }
  return best;
}
