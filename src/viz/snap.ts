/**
 * Pontrács + mágneses pillanýítás (magnetic snapping) a rajzfelületen.
 *
 * FONTOS: a rács RAJZOLÁSA és a rácsra való PILLANÝÍTÁS szándékosan ugyanitt
 * van, ugyanazzal a `GRID_PX` léptékkel. Ha a kettő külön helyen élne, a
 * vonalvég nem pont a pontra esne, és a „mágneses" érzés azonnal elromlik.
 *
 * Az eszközszerű CAD-szabályok:
 *  1. a pontok rácsra ugranak (mérnöki papír) — mindig, ha a rács elég sűrű;
 *  2. egy másik csakmópont végpontja erősebb mágnes: oda ugrik, ha közel kerül;
 *  3. tengelyillesztés: vízszintes/függőleges vonalra ugrás (a "rácsos" érzés);
 *  4. Alt lenyomva a pillanýítás átmenetileg kikapcsol (szabad mozgás).
 *
 * Tiszta függvények + egyetlen minta-gyár → tesztelhető (tests/snap.test.ts).
 */

import type { FrameModel } from '../fem/frame';
import { screenToWorld, worldToScreen, type ViewTransform } from './picking';

/** Pontrács osztása [px] — a rajzolt rács és a pillanýítás közös léptéke */
export const GRID_PX = 17;

/**
 * A pont a csempe KÖZÉPPONTJÁBAN ül → a rács origója a képernyő (0,0) pontjához
 * képest ennyivel van eltolva. Kerekítésnél ezt figyelembe kell venni, különben
 * a végpont mindig a pontok közé landol, nem rájuk.
 */
export const GRID_OFFSET_PX = GRID_PX / 2;

/** Mágnes hatótávolsága [px] — ennél közelebb a végpont a célra ugrik */
export const MAGNET_PX = 13;

/** Ha a rács világléptője ennél nagyobb, a rács túl ritka → szabad mozgás */
const MAX_GRID_STEP = 0.5;

export type SnapKind = 'node' | 'alignX' | 'alignY' | 'grid' | 'none';

export interface SnapResult {
  /** A végpont új világkoordinátája */
  x: number;
  y: number;
  /**
   * Mihez ugrott:
   *  - `node`:  egy másik csomópontra (a szakasz végpontja) — ez a legerősebb;
   *  - `alignX`: a végpont X-e a csomópont X-ére ugrott (függőleges egyenes);
   *  - `alignY`: a végpont Y-e a csomópont Y-ére ugrott (vízszintes egyenes);
   *  - `grid`:  a pontrácsra; `none`: szabad mozgás.
   */
  kind: SnapKind;
  /** Az elkapott csomópont id-ja (align/grid esetén is megadható a forrása) */
  nodeId: number | null;
}

/** Azok a célok, amiket valóban "mágnesként" kínálunk (a rács mindig elérhető) */
export type MagnetKind = 'node' | 'alignX' | 'alignY';

export interface MagnetTarget extends Omit<SnapResult, 'kind'> {
  kind: MagnetKind;
  /** Képernyő-px-ben mért távolság a mutatótól */
  distPx: number;
}

/**
 * Pontrács-minta (mérnöki papír). Egyszer létrehozva, sokszorosítva.
 * A középpont üres helyét a GRID_OFFSET_PX adja meg — a pillanýítás ugyanezt
 * használja, ezért a rajzolt pont és az ugrási pont egybeesik.
 */
export function makeDotPattern(
  ctx: CanvasRenderingContext2D,
  dark: boolean,
  spacingPx: number = GRID_PX,
): CanvasPattern {
  const s = Math.max(4, Math.round(spacingPx));
  const c = document.createElement('canvas');
  c.width = s;
  c.height = s;
  const g = c.getContext('2d')!;
  // Az átlátszatlanság a mintában van, nem globalAlpha-val a rajzoláskor:
  // így a pontosság egy helyen szabályozott, nem kétszer.
  g.fillStyle = dark ? 'rgba(160, 196, 240, 0.46)' : 'rgba(48, 74, 132, 0.66)';
  g.beginPath();
  g.arc(s / 2, s / 2, 1.2, 0, Math.PI * 2);
  g.fill();
  return ctx.createPattern(c, 'repeat')!;
}

/** A pont rácsra ugrása: a képernyő-koordinátát kerekítjük, vissza világba */
export function snapToGrid(
  wx: number,
  wy: number,
  t: ViewTransform,
  spacingPx: number = GRID_PX,
  offsetPx: number = spacingPx / 2,
): { x: number; y: number } {
  const s = worldToScreen(wx, wy, t);
  const gx = offsetPx + Math.round((s.x - offsetPx) / spacingPx) * spacingPx;
  const gy = offsetPx + Math.round((s.y - offsetPx) / spacingPx) * spacingPx;
  return screenToWorld(gx, gy, t);
}

/**
 * A mágneses célok priorizálása. A sorrend NEM pusztán távolság szerinti:
 * a csomópont mindig veri a tengelyillesztést, különben a végpont átugraná
 * a szakasz végpontján anélkül, hogy oda érne. A tengelyillesztés a
 * másodlagos kényelem: egy vonalba állítás, nem célpont-érzés.
 */
const TIER: Record<MagnetKind, number> = { node: 0, alignX: 1, alignY: 1 };

/**
 * A legközelebbi mágneses cél: egy másik csomópont, vagy annak vízszintes/
 * függőleges vonala. `excludeNodeId` a húzott csomópont — önmagához nem ugorhat.
 */
export function findMagnet(
  wx: number,
  wy: number,
  model: FrameModel,
  t: ViewTransform,
  excludeNodeId: number | null,
  radiusPx: number = MAGNET_PX,
): MagnetTarget | null {
  const p = worldToScreen(wx, wy, t);
  let best: MagnetTarget | null = null;
  for (const n of model.nodes) {
    if (n.id === excludeNodeId) continue;
    const q = worldToScreen(n.x, n.y, t);
    const dx = q.x - p.x;
    const dy = q.y - p.y;
    const cands: MagnetTarget[] = [
      { x: n.x, y: n.y, kind: 'node', nodeId: n.id, distPx: Math.hypot(dx, dy) },
    ];
    // X rögzül a csomóponténál → függőleges egyenes; a hibája |dx|
    if (Math.abs(dx) < radiusPx) {
      cands.push({ x: n.x, y: wy, kind: 'alignX', nodeId: n.id, distPx: Math.abs(dx) });
    }
    // Y rögzül → vízszintes egyenes; a hibája |dy|
    if (Math.abs(dy) < radiusPx) {
      cands.push({ x: wx, y: n.y, kind: 'alignY', nodeId: n.id, distPx: Math.abs(dy) });
    }
    for (const c of cands) {
      if (c.distPx > radiusPx) continue;
      if (
        best === null ||
        TIER[c.kind] < TIER[best.kind] ||
        (TIER[c.kind] === TIER[best.kind] && c.distPx < best.distPx)
      ) {
        best = c;
      }
    }
  }
  return best;
}

export interface SnapOptions {
  /** Mágnes hatótávolsága [px] */
  radiusPx?: number;
  /** Rács osztása [px] */
  spacingPx?: number;
  /** false = szabad mozgás (Alt lenyomva) */
  enabled?: boolean;
}

/**
 * A végpont teljes pillanýítása. Prioritás: csomópont-mágnes → tengelyillesztés
 * → pontrács → szabad. Ha a rács világléptője túl nagy (erősen kizoomolva), a
 * rács kikapcsol, mert akkor 0,5 m-es ugrásokkal ráncigálná a geometriát.
 */
export function resolveSnap(
  wx: number,
  wy: number,
  model: FrameModel,
  t: ViewTransform,
  excludeNodeId: number | null,
  opts: SnapOptions = {},
): SnapResult {
  if (opts.enabled === false) return { x: wx, y: wy, kind: 'none', nodeId: null };
  const magnet = findMagnet(wx, wy, model, t, excludeNodeId, opts.radiusPx ?? MAGNET_PX);
  if (magnet) {
    return { x: magnet.x, y: magnet.y, kind: magnet.kind, nodeId: magnet.nodeId };
  }
  const spacingPx = opts.spacingPx ?? GRID_PX;
  if (spacingPx / t.scale > MAX_GRID_STEP) {
    return { x: wx, y: wy, kind: 'none', nodeId: null };
  }
  const g = snapToGrid(wx, wy, t, spacingPx);
  return { x: g.x, y: g.y, kind: 'grid', nodeId: null };
}
