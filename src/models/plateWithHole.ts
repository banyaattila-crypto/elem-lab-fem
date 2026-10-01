/**
 * 3. modell: Lyukas lemez
 * Egyirányú húzás alatt álló lemez középen körlyukkal.
 * Klasszikus feszültségkoncentrációs példa:
 *   σ_max ≈ 3σ₀ a lyuk szélén (Kt ≈ 3, d/W → 0 határeset)
 *
 * Háló (v0.16.0): VALÓDI HÁROMLI ŐGEZŐSÉG, körre követő lyukhatárral.
 * A korábbi módszer (rács + „súlypont a lyukban → elem törlés") lépcsős
 * lyukhatárt hagyott; a résszög-sarkok szinguláris pontjai miatt a mért
 * Kt 4,1–5,0 között szóródott. Most sugárcsalád épül: minden irányban
 * egy sugár fut a lyukhatártól a négyszög határáig, a pontok sugár
 * irányban GEOMETRIAILAG ritkulnak (finom a lyuknál), és minden sugáron
 * azonos a pontszám → a szomszédos sugarak háromszögsávokkal konform
 * összefűzhetők. Nincs lépcső, nincs résszög-sarok.
 *
 * Terhelés: σ₀ a bal/jobb élen, csomópontonként a HOZZÁTARTOZÓ hosszal
 * súlyozva (tributária). Ez lényeges: a kilépési pontok az élen nem
 * egyenletesek, és az egyenletes csomóponti erő a középső sávot
 * túlterhelné → hamis Kt-emelkedés (mérve: 4,6 a helyes ~3,8 helyett).
 */

import type { Element, Mesh, Vec2 } from '../fem/types';
import { MATERIALS, triangleArea } from './meshgen';

export interface PlateWithHoleOptions {
  /** Lemez szélessége (X) [m] */
  W?: number;
  /** Lemez magassága (Y) [m] */
  H?: number;
  /** Lyuk sugara [m] */
  holeR?: number;
  /** Lemezvastagság [m] */
  thickness?: number;
  material?: keyof typeof MATERIALS;
  /** Névleges húzófeszültség σ₀ az élvonalon [Pa] */
  sigma0?: number;
  /** Háló finomság (1..10) — a lyuk körüli irány- és radiális felbontás ebből nő */
  density?: number;
}

export function buildPlateWithHole(opts: PlateWithHoleOptions = {}): Mesh {
  const W = opts.W ?? 1;
  const H = opts.H ?? 2;
  const holeR = opts.holeR ?? 0.2;
  const thickness = opts.thickness ?? 0.005;
  const material = MATERIALS[opts.material ?? 'steel'];
  const sigma0 = opts.sigma0 ?? 1e6;
  const density = Math.max(1, Math.min(10, opts.density ?? 3));

  if (holeR >= W / 2 || holeR >= H / 2) {
    throw new Error('A lyuk sugara kisebb legyen, mint W/2 és H/2');
  }

  const cx = W / 2;
  const cy = H / 2;

  const nodes: Array<{ id: number; x: number; y: number }> = [];
  const elements: Element[] = [];
  const nodeAt = new Map<string, number>();
  const addNode = (x: number, y: number): number => {
    const k = `${x.toFixed(7)},${y.toFixed(7)}`;
    const existing = nodeAt.get(k);
    if (existing !== undefined) return existing;
    const id = nodes.length;
    nodes.push({ id, x, y });
    nodeAt.set(k, id);
    return id;
  };
  /** Háromszög felvétele előjelet javítva (CCW), degeneráltat eldobva */
  const addElem = (a: number, b: number, c: number): void => {
    const p1 = nodes[a]!;
    const p2 = nodes[b]!;
    const p3 = nodes[c]!;
    const area = triangleArea(p1, p2, p3);
    if (Math.abs(area) < 1e-14) return;
    if (area > 0) elements.push({ id: elements.length, nodes: [a, b, c] });
    else elements.push({ id: elements.length, nodes: [a, c, b] });
  };

  // ——— Felbontás a sűrűségből ———
  const target = 0.055 / Math.sqrt(density); // cél-elemméret a lyuk körül [m]
  // tangenciális: a lyuk ívén ~0.6·target ívlépés (4 többszöröse)
  let nTheta = Math.round((2 * Math.PI * holeR) / (0.6 * target));
  nTheta = Math.max(24, Math.min(160, Math.round(nTheta / 4) * 4));
  // radiális: geometriai ritkulás; az első réteg vastagsága ≈ 0.65·target
  const eCorner = Math.hypot(cx, cy);
  const growth = 1 + (0.65 * target) / holeR;
  const nR = Math.max(8, Math.min(40, Math.ceil(Math.log(eCorner / holeR) / Math.log(growth))));

  /**
   * Kilépési távolság: a (cx,cy)-ből (cosθ,sinθ) irányban milyen r-nél
   * hagyja el a sugár a [0,W]×[0,H] négyszöget.
   */
  const exitDist = (th: number): number => {
    const dx = Math.cos(th);
    const dy = Math.sin(th);
    const ex = Math.abs(dx) < 1e-12 ? Infinity : cx / Math.abs(dx);
    const ey = Math.abs(dy) < 1e-12 ? Infinity : cy / Math.abs(dy);
    return Math.min(ex, ey);
  };

  // ——— Sugarak: minden irányban nR+1 pont, geometriai eloszlással ———
  // r_k = holeR · (e/holeR)^(k/nR): a lyuknál finom, a szélnél ritkább,
  // és MINDEN sugáron azonos a pontszám → a gyűrűk zárt polilinek.
  const ringIds: number[][] = [];
  for (let i = 0; i < nTheta; i++) {
    const th = (2 * Math.PI * i) / nTheta;
    const e = exitDist(th);
    const ray: number[] = [];
    for (let k = 0; k <= nR; k++) {
      const r = holeR * Math.pow(e / holeR, k / nR);
      ray.push(addNode(cx + r * Math.cos(th), cy + r * Math.sin(th)));
    }
    ringIds.push(ray);
  }

  // ——— Háromszögsávok a szomszédos sugarak között (konform, zárt) ———
  for (let i = 0; i < nTheta; i++) {
    const A = ringIds[i]!;
    const B = ringIds[(i + 1) % nTheta]!;
    for (let k = 0; k < nR; k++) {
      addElem(A[k]!, B[k]!, B[k + 1]!);
      addElem(A[k]!, B[k + 1]!, A[k + 1]!);
    }
  }

  // ——— Peremfeltételek: σ₀ a bal és jobb élen, tributária-súlyozva ———
  const leftEdge: number[] = [];
  const rightEdge: number[] = [];
  for (const n of nodes) {
    if (Math.abs(n.x) < 1e-6) leftEdge.push(n.id);
    if (Math.abs(n.x - W) < 1e-6) rightEdge.push(n.id);
  }

  /**
   * Egy él csomópontjainak hozzátartozó hossza: a szomszédos él-pontok
   * felezőpontjai közötti szakasz. A végeken egyoldalas fél-lépés.
   * Az összeg pontosan az él hossza → ΣF = σ₀·t·H (reakció-egyensúly).
   */
  const tributary = (ids: number[], y: (id: number) => number): Map<number, number> => {
    const sorted = [...ids].sort((a, b) => y(a) - y(b));
    const out = new Map<number, number>();
    for (let k = 0; k < sorted.length; k++) {
      const c = y(sorted[k]!);
      const before = k > 0 ? (c + y(sorted[k - 1]!)) / 2 : c;
      const after = k < sorted.length - 1 ? (c + y(sorted[k + 1]!)) / 2 : c;
      out.set(sorted[k]!, Math.max(after - before, 1e-9));
    }
    return out;
  };

  const loads: Record<number, Vec2> = {};
  for (const [id, len] of tributary(leftEdge, (id) => nodes[id]!.y)) {
    loads[id] = { x: -sigma0 * thickness * len, y: 0 };
  }
  for (const [id, len] of tributary(rightEdge, (id) => nodes[id]!.y)) {
    loads[id] = { x: sigma0 * thickness * len, y: 0 };
  }

  // Rigid-test módok ellen: ux = 0 a bal élen (x-elmozdulás + vízszintes
  // elcsúszás), uy = 0 a bal él legalsó csomópontján (függőleges elmozdulás).
  // Egyetlen pont befogása önmagában elfordulást engedne → szinguláris rendszer.
  let bottomLeft = leftEdge[0]!;
  let minY = Infinity;
  for (const id of leftEdge) {
    const n = nodes[id]!;
    if (n.y < minY) {
      minY = n.y;
      bottomLeft = id;
    }
  }

  return {
    nodes,
    elements,
    material: { ...material },
    thickness,
    bc: { fixed: [bottomLeft], rollerX: leftEdge, loads },
    type: 'plane-stress',
    annotation: {
      geom: `Lyukas lemez · ${fmtLen(W)}×${fmtLen(H)}`,
      section: `Lemez t = ${(thickness * 1000).toFixed(1)} mm · lyuk d = ${(2 * holeR * 1000).toFixed(0)} mm`,
      statics: `Statika: egyirányú húzás σ₀ = ${fmtStress(sigma0)} · bal él ux = 0 + sarok`,
      holes: [{ cx, cy, r: holeR }],
      supports: [{ x: 0, y: minY, kind: 'fixed' as const, dir: 'left' as const }],
      pointLoads: [
        { x: 0, y: cy, fx: -sigma0 * thickness * H, fy: 0, label: `σ₀ = ${fmtStress(sigma0)}` },
        { x: W, y: cy, fx: sigma0 * thickness * H, fy: 0 },
      ],
    },
  };
}

/** Rövid hossz-formázó a metaadatokhoz */
function fmtLen(m: number): string {
  return m >= 1 ? `${m.toFixed(2)} m` : `${(m * 1000).toFixed(0)} mm`;
}

/** Feszültség-formázó a sémához */
function fmtStress(pa: number): string {
  const a = Math.abs(pa);
  if (a >= 1e6) return `${(pa / 1e6).toFixed(2)} MPa`;
  return `${(pa / 1e3).toFixed(0)} kPa`;
}

/** Analitikus feszültségkoncentrációs tényező (d/W → 0 határeset): Kt = 3 */
export function plateWithHoleKt(): number {
  return 3;
}
