/**
 * Pontrács + mágneses pillanýítás: a húzott vonalvégnek mindig oda kell
 * ugarnia, ahová a felhasználó vizuálisan számít.
 *
 * A kritikus szerződés: a RAJZOLT pontok és a PILLANÝÍTÁS ugyanaz a rács
 * (közös modul, közös GRID_PX lépték). Ha ez szétcsúszik, a végpont a pontok
 * közé esik, és a "mágneses" érzés megszűnik.
 *
 * A távolságok MINDENütt képernyő-px-ben értendők (nem világegységben):
 * a hatótávolság így zoomfüggetlen, és a 100 px/m-es nézetben 1 px = 1 cm.
 */

import { describe, expect, it } from 'vitest';
import type { FrameModel } from '../src/fem/frame';
import { solveFrame, nodeMoveIsSafe } from '../src/fem/frame';
import { buildFrameCantilever } from '../src/models/frames';
import type { ViewTransform } from '../src/viz/picking';
import { worldToScreen, screenToWorld } from '../src/viz/picking';
import {
  GRID_PX,
  GRID_OFFSET_PX,
  MAGNET_PX,
  findMagnet,
  resolveSnap,
  snapToGrid,
} from '../src/viz/snap';

/** 800×600 nézet, 100 px/m nagyítás, origó a középen → 1 px = 1 cm */
const VIEW: ViewTransform = {
  midX: 0,
  midY: 0,
  scale: 100,
  canvasWidth: 800,
  canvasHeight: 600,
};

const MODEL: FrameModel = {
  memberType: 'beam',
  nodes: [
    { id: 0, x: 0, y: 0 },
    { id: 1, x: 2, y: 0 },
    { id: 2, x: 2, y: 1.5 },
    { id: 3, x: 4, y: 1.5 },
  ],
  beams: [],
  supports: [],
  pointLoads: [],
  distLoads: [],
  sections: {},
  material: { name: 'S235', E: 210e9, nu: 0.3, rho: 7850, fy: 235e6 },
};

/** px-ben mért távolság két világpont között a nézetben */
function pxDist(ax: number, ay: number, bx: number, by: number, view = VIEW): number {
  const a = worldToScreen(ax, ay, view);
  const b = worldToScreen(bx, by, view);
  return Math.hypot(b.x - a.x, b.y - a.y);
}

describe('Pontrács — a rajzolt pont és az ugrási pont egybeesik', () => {
  it('A rács léptéke és eltolása konzisztens (a két helyen nem csolhat el)', () => {
    // A csempe 17×17 px, a pont a közepén → az origó a (0,0) képernyőponthoz
    // képest 8,5 px-re van. A snapToGrid ugyanezt használja, különben a
    // kerekítés mindig a pontok közé esne.
    expect(GRID_PX).toBe(17);
    expect(GRID_OFFSET_PX).toBe(GRID_PX / 2);
  });

  it('Az ugrás a pont helyére visz, nem a pontok közé', () => {
    const out = snapToGrid(0.005, 0.003, VIEW);
    const s = worldToScreen(out.x, out.y, VIEW);
    // A képernyő-pont a (0,0) saroktól mérve pontosan egy rácspont
    const offX = ((s.x - GRID_OFFSET_PX) % GRID_PX + GRID_PX) % GRID_PX;
    const offY = ((s.y - GRID_OFFSET_PX) % GRID_PX + GRID_PX) % GRID_PX;
    expect(Math.min(offX, GRID_PX - offX)).toBeLessThan(1e-9);
    expect(Math.min(offY, GRID_PX - offY)).toBeLessThan(1e-9);
  });

  it('A rács ugrása állandó, bármilyen közel kerülünk egy ponthoz', () => {
    // Tíz egymástól 1 px-re lévő képernyőpont mind ugyanarra a rácspontra ugrik
    const targets = new Set<string>();
    for (let i = 0; i < 10; i++) {
      const sx = 0.004 * i; // 0..0,036 m → 0..3,6 px
      const g = snapToGrid(sx, 0, VIEW);
      const s = worldToScreen(g.x, g.y, VIEW);
      targets.add(`${s.x.toFixed(6)},${s.y.toFixed(6)}`);
    }
    expect(targets.size).toBe(1);
  });

  it('Idempotens: az ugrás ugrás után nem mozdul meg', () => {
    const once = snapToGrid(0.31, -0.27, VIEW);
    const twice = snapToGrid(once.x, once.y, VIEW);
    expect(twice.x).toBeCloseTo(once.x, 12);
    expect(twice.y).toBeCloseTo(once.y, 12);
  });

  it('A világ-visszakerekítés nem rontja el a képernyőpozíciót', () => {
    // screenToWorld és worldToScreen egymás inverze — a pillanýítás ezen
    // épül, ellenkező esetben a pont látszólag elcsúszik a rácson
    const p = { x: 1.234, y: -0.987 };
    const s = worldToScreen(p.x, p.y, VIEW);
    const back = screenToWorld(s.x, s.y, VIEW);
    expect(back.x).toBeCloseTo(p.x, 12);
    expect(back.y).toBeCloseTo(p.y, 12);
  });
});

describe('Mágneses csomópont-végpont', () => {
  it('Közel a szakasz végpontjához: oda ugrik', () => {
    // A mutató 5 px-re van a 0-s csomóponttól (a (0,0) saroktól)
    const snap = resolveSnap(0.03, 0.04, MODEL, VIEW, 1);
    expect(snap.kind).toBe('node');
    expect(snap.nodeId).toBe(0);
    expect(snap.x).toBe(0);
    expect(snap.y).toBe(0);
  });

  it('Távol a csomópontoktól: csak a rács fogja meg', () => {
    const snap = resolveSnap(1.234, 0.567, MODEL, VIEW, 1);
    expect(snap.kind).toBe('grid');
    expect(snap.nodeId).toBeNull();
  });

  it('A húzott csomópont önmagához nem ugorhat (körbe nem lehet ugrani)', () => {
    // A mutató pontosan a 0-s csomóponton áll, de az a húzott pont
    const snap = resolveSnap(0, 0, MODEL, VIEW, 0);
    expect(snap.kind).not.toBe('node');
    expect(snap.nodeId).not.toBe(0);
  });

  it('A csomópont-mágnes a PRIORITÁS, nem a puszta távolság', () => {
    // Itt a legközelebbi rácspont (3,8 px) közelebb van, mint a csomópont
    // (5 px) → ha a sorrend távolság lenne, a rács nyerne és a végpont
    // átugrana a szakasz végpontján. A csomópontnak kell nyernie.
    const s = worldToScreen(0.03, 0.04, VIEW);
    const g = snapToGrid(0.03, 0.04, VIEW);
    const gs = worldToScreen(g.x, g.y, VIEW);
    expect(Math.hypot(gs.x - s.x, gs.y - s.y)).toBeLessThan(pxDist(0.03, 0.04, 0, 0));
    expect(resolveSnap(0.03, 0.04, MODEL, VIEW, 1).kind).toBe('node');
  });

  it('A legközelebbi csomópont nyer, nem a listában az első', () => {
    // A 3-as csomópont közelebb van, és a LISTA VÉGÉN áll → nem az sorrend dönt
    const two: FrameModel = {
      ...MODEL,
      nodes: [
        { id: 0, x: 0, y: 0 },
        { id: 1, x: 2, y: 0 },
        { id: 2, x: 4, y: 1.5 },
        { id: 3, x: 0.06, y: 0.01 },
      ],
    };
    const snap = resolveSnap(0.05, 0.01, two, VIEW, 1);
    expect(snap.kind).toBe('node');
    expect(snap.nodeId).toBe(3);
  });

  it('A hatótávolságon kívül nincs mágnes, de a rács továbbra is fog', () => {
    // Mindkét tengelyen 13 px-nél távolabb van a legközelebbi csomóponttól,
    // különben a (jogos) tengely-igazítás fogná meg
    const snap = resolveSnap(0.5, 0.5, MODEL, VIEW, 1);
    expect(snap.kind).toBe('grid');
    expect(findMagnet(0.5, 0.5, MODEL, VIEW, 1)).toBeNull();
    // …és a hatórányon belül már van mágnes, ugyanitt
    expect(findMagnet(0.5, (MAGNET_PX - 1) / VIEW.scale, MODEL, VIEW, 1)?.kind).toBe('alignY');
  });

  it('A hatótávolság belsejében már csomópont-mágnes', () => {
    const inside = (MAGNET_PX - 0.5) / VIEW.scale;
    expect(findMagnet(0, inside, MODEL, VIEW, 1)?.kind).toBe('node');
  });
});

describe('Tengely-igazítás (a vonalba állítás kényelme)', () => {
  it('X rögzül: a végpont a csomópont függőleges egyenesére ugrik', () => {
    // 4 px-rel a 0-s csomópont X-én, de 20 px-rel a pontjától
    const snap = resolveSnap(0.04, 0.2, MODEL, VIEW, 1);
    expect(snap.kind).toBe('alignX');
    expect(snap.nodeId).toBe(0);
    expect(snap.x).toBe(0);
    expect(snap.y).toBeCloseTo(0.2, 12); // a szabad komponens megmarad
  });

  it('Y rögzül: a végpont a csomópont vízszintes egyenesére ugrik', () => {
    const snap = resolveSnap(0.2, 0.04, MODEL, VIEW, 1);
    expect(snap.kind).toBe('alignY');
    expect(snap.nodeId).toBe(0);
    expect(snap.y).toBe(0);
    expect(snap.x).toBeCloseTo(0.2, 12);
  });

  it('Az igazítás nem nyeli el a szabad komponenst (magasság állítható)', () => {
    const snap = resolveSnap(0.04, 0.33, MODEL, VIEW, 1);
    expect(snap.kind).toBe('alignX');
    expect(snap.x).toBe(0);
    expect(snap.y).toBeCloseTo(0.33, 12);
  });

  it('A csomópont-mágnes veri az azonos tengelyű igazítást', () => {
    // Pontosan a 0-s csomópont Y-vonalán van, de a pontja közelebb is →
    // a végpontnak a PONTRA kell ugrania, nem csak a vonalra
    const snap = resolveSnap(0.005, 0, MODEL, VIEW, 1);
    expect(snap.kind).toBe('node');
  });
});

describe('A húzás nem rontja el a geometriát', () => {
  const BAR: FrameModel = {
    ...MODEL,
    memberType: 'bar',
    beams: [
      { id: 1, nodeI: 0, nodeJ: 1, sectionId: 's' },
      { id: 2, nodeI: 1, nodeJ: 2, sectionId: 's' },
    ],
    sections: { s: { id: 's', name: 's', A: 0.001, Iy: 1e-6, Wy: 1e-5, h: 0.1, b: 0.1 } },
  };

  it('Nem engedi a rújat összapadni nullára (mágneses rátaszítés)', () => {
    // Az 1-es végpont pontosan a 0-sra kerülne → L = 0 → c = 0/0 = NaN
    expect(nodeMoveIsSafe(BAR, 1, 0, 0)).toBe(false);
    expect(nodeMoveIsSafe(BAR, 1, 0.001, 0)).toBe(false);
  });

  it('A szomszédos végponttól 1 cm-en belül már elutasítja', () => {
    expect(nodeMoveIsSafe(BAR, 1, 0.005, 0)).toBe(false);
    expect(nodeMoveIsSafe(BAR, 1, 0.02, 0)).toBe(true);
  });

  it('Csak a húzott csomóponthoz csatlakozó rúdakat vizsgálja', () => {
    // A 3-as csomópont (nincs rúd hozzá) bármerre mehet, és a 0-ás is,
    // mert az 1-estől 2 m-re van
    expect(nodeMoveIsSafe(BAR, 3, -5, -5)).toBe(true);
    expect(nodeMoveIsSafe(BAR, 0, -5, -5)).toBe(true);
  });

  it('A végtelen koordinátát is elutasítja', () => {
    expect(nodeMoveIsSafe(BAR, 1, Number.NaN, 0)).toBe(false);
    expect(nodeMoveIsSafe(BAR, 1, Number.POSITIVE_INFINITY, 0)).toBe(false);
  });

  it('Az őrző valódi védelem: az összapadt rúd NaN-t adna', () => {
    const collapsed: FrameModel = {
      ...BAR,
      nodes: BAR.nodes.map((n) => (n.id === 1 ? { ...n, x: 0, y: 0 } : n)),
    };
    // Bizonyíték, hogy a védelem nem elvi: c = dx/L = 0/0 → az egész
    // merevességi mátrix NaN, és a feszültség is NaN lesz belőle
    expect(Number.isNaN(solveFrame(collapsed).maxStress)).toBe(true);
    expect(nodeMoveIsSafe(BAR, 1, 0, 0)).toBe(false);
  });

  it('Az elhúzott csomópont magával viszi a terhet, a támasz helyben marad', () => {
    // Ez a húzás ígérete: a terhek/támaszok id-alapon kötődnek, ezért a
    // végpont elmozdításakor a teljes modellnek vele kell mennie.
    const m = buildFrameCantilever({ loadN: 1000 });
    const free = m.nodes.find((n) => n.id === 1)!;
    const anchor = m.nodes.find((n) => n.id === 0)!;
    const loadNodeId = m.pointLoads[0]!.nodeId;
    expect(loadNodeId).toBe(free.id); // a konzol a szabad végen van terhelve

    free.x = 3.2; // a konzoleredő végpontja 3,2 m-re kerül
    free.y = 0.4; // és fel is emelkedik → ferde rúd
    const sol = solveFrame(m);

    expect(Number.isFinite(sol.maxStress)).toBe(true);
    expect(anchor.x).toBe(0); // a befogott végpont nem mozdul
    // A teher pozícióját a csomópont adja → utána kell járnia
    expect(m.pointLoads[0]!.nodeId).toBe(free.id);
    const L = Math.hypot(free.x - anchor.x, free.y - anchor.y);
    expect(L).toBeCloseTo(Math.hypot(3.2, 0.4), 12);
    // A reakciók a terheléssel egyensúlyban maradnak, bármerre húztunk:
    // ΣR + ΣF = 0, ahol a konzolterhelés fy = -1000
    const rs = [...sol.reactions.values()];
    expect(rs.length).toBeGreaterThan(0);
    expect(Math.abs(rs.reduce((a, r) => a + r.x, 0))).toBeLessThan(1e-6);
    expect(Math.abs(rs.reduce((a, r) => a + r.y, 0) - 1000)).toBeLessThan(1e-6);
  });
});

describe('Szabad mozgás és a túl ritka rács', () => {
  it('Alt (enabled: false): sem mágnes, sem rács', () => {
    const snap = resolveSnap(0.02, 0.02, MODEL, VIEW, 1, { enabled: false });
    expect(snap.kind).toBe('none');
    expect(snap.x).toBe(0.02);
    expect(snap.y).toBe(0.02);
  });

  it('A túl ritka rács kikapcsol, hogy ne ráncigálná a geometriát', () => {
    // 30 px/m → a 17 px-es rács 0,57 m léptőt adna, már több mint a 0,5 m korlát
    const zoomedOut: ViewTransform = { ...VIEW, scale: 30 };
    expect(GRID_PX / zoomedOut.scale).toBeGreaterThan(0.5);
    // Mindkét tengelyen kívül a csomópontok mágneszónáján
    const snap = resolveSnap(1.1, 0.8, MODEL, zoomedOut, 1);
    expect(snap.kind).toBe('none');
    expect(snap.x).toBe(1.1);
    expect(snap.y).toBe(0.8);
  });

  it('Kizoomolva is működik a csomópont-mágnes (az fontosabb a rácsnál)', () => {
    // A hatótávolság px-ben számít, így a nagyítás nem gyengíti
    const zoomedOut: ViewTransform = { ...VIEW, scale: 30 };
    const nearWorld = (MAGNET_PX - 1) / zoomedOut.scale;
    const snap = resolveSnap(nearWorld, 0, MODEL, zoomedOut, 1);
    expect(snap.kind).toBe('node');
  });

  it('Normál nagyításnál a rács él (a 0,5 m-es korlát alatt vagyunk)', () => {
    expect(GRID_PX / VIEW.scale).toBeLessThan(0.5);
    expect(resolveSnap(1.1, 0.37, MODEL, VIEW, 1).kind).toBe('grid');
  });
});
