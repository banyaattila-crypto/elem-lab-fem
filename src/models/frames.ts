/**
 * Vázmodellek (1D rúd/rács) — a terv 6–7., 9.1 fejezetei.
 * Minden builder FrameModel-t ad (a frame.ts megoldó szerint), a terhelés
 * pont- vagy megoszló lehet, a szelvény a katalógusból cserélhető.
 */

import type { FrameBeam, FrameMaterial, FrameModel, FramePointLoad, FrameSection } from '../fem/frame';

// ————— Keresztmetszet-könyvtár (terv 6. fejezet) —————

/** Téglalap b×h [m] */
export function rectSection(b: number, h: number, id = 'rect', name?: string): FrameSection {
  return { id, name: name ?? `${(b * 1000).toFixed(0)}×${(h * 1000).toFixed(0)} mm`, A: b * h, Iy: (b * h ** 3) / 12, Wy: (b * h ** 2) / 6, b, h };
}

/** Kör d [m] */
export function circleSection(d: number, id = 'circle', name?: string): FrameSection {
  return { id, name: name ?? `Ø${(d * 1000).toFixed(0)} mm`, A: (Math.PI * d ** 2) / 4, Iy: (Math.PI * d ** 4) / 64, Wy: (Math.PI * d ** 3) / 32, b: d, h: d };
}

/** Üreges téglalap b×h×t [m] */
export function tubeRectSection(b: number, h: number, t: number, id = 'tubeRect', name?: string): FrameSection {
  const A = b * h - (b - 2 * t) * (h - 2 * t);
  const Iy = (b * h ** 3 - (b - 2 * t) * (h - 2 * t) ** 3) / 12;
  return { id, name: name ?? `${(b * 1000).toFixed(0)}×${(h * 1000).toFixed(0)}×${(t * 1000).toFixed(0)}`, A, Iy, Wy: (2 * Iy) / h, b, h };
}

/** I-profil cm-egységekből (EN 10365) */
function ipeSection(name: string, Acm2: number, Icm4: number, Wcm3: number): FrameSection {
  return {
    id: name.toLowerCase().replace(/\s/g, ''),
    name,
    A: Acm2 * 1e-4, // cm² → m²
    Iy: Icm4 * 1e-8, // cm⁴ → m⁴
    Wy: Wcm3 * 1e-6, // cm³ → m³
    b: 0.1,
    h: 0.2,
  };
}

/** Beépített szelvény-katalógus (a szelvény-választó és a modellek közös táháza) */
export const FRAME_SECTIONS: Record<string, FrameSection> = {
  rect: rectSection(0.02, 0.4),
  rectSlim: rectSection(0.02, 0.2, 'rectSlim', '20×200 mm'),
  circle: circleSection(0.1),
  tubeRect: tubeRectSection(0.12, 0.24, 0.008),
  ipe200: ipeSection('IPE 200', 28.5, 1943, 194.3),
  ipe300: ipeSection('IPE 300', 53.8, 8356, 557.0),
  hea200: ipeSection('HEA 200', 53.8, 3692, 369.2),
  heb200: ipeSection('HEB 200', 78.1, 5696, 569.6),
};

// ————— Anyag-katalógus (terv 7. fejezet) —————

export const FRAME_MATERIALS: Record<string, FrameMaterial> = {
  s235: { name: 'Acél S235', E: 210e9, nu: 0.3, rho: 7850, fy: 235e6 },
  s355: { name: 'Acél S355', E: 210e9, nu: 0.3, rho: 7850, fy: 355e6 },
  al6060: { name: 'Alumínium 6060', E: 70e9, nu: 0.33, rho: 2700, fy: 150e6 },
  woodC24: { name: 'Fa C24 (GL24)', E: 11e9, nu: 0.3, rho: 420, fy: 24e6 },
  concrete: { name: 'Beton C25/30', E: 30e9, nu: 0.2, rho: 2500, fy: 25e6 },
};
export type FrameMaterialKey = keyof typeof FRAME_MATERIALS;

// ————— Modell-generátorok —————

interface SharedOptions {
  section?: FrameSection;
  material?: FrameMaterial;
  /** Terhelő erő [N] (megoszlónál a q·L összerő) */
  loadN?: number;
  loadType?: 'point' | 'distributed';
}

/** 1. Konzolgerenda (rúd): L balról befogva, jobb végén P vagy q */
export function buildFrameCantilever(opts: SharedOptions = {}): FrameModel {
  const section = opts.section ?? FRAME_SECTIONS.rect!;
  const material = opts.material ?? FRAME_MATERIALS.s235!;
  const L = 2;
  const loadN = opts.loadN ?? 1000;
  const loadType = opts.loadType ?? 'point';
  const q = loadN / L;

  const model = baseFrame('beam', section, material, [
    { id: 0, x: 0, y: 0 },
    { id: 1, x: L, y: 0 },
  ]);
  model.beams.push({ id: 0, nodeI: 0, nodeJ: 1, sectionId: section.id });
  model.supports.push({ nodeId: 0, kind: 'fixed' });
  if (loadType === 'point') model.pointLoads.push({ nodeId: 1, fx: 0, fy: -loadN });
  else model.distLoads.push({ beamId: 0, qy: -q });
  return model;
}

/** 2. Egyszerűen tartott gerenda: L, középen P (3 csomó / 2 rúd) vagy q */
export function buildFrameSimplySupported(opts: SharedOptions = {}): FrameModel {
  const section = opts.section ?? FRAME_SECTIONS.rect!;
  const material = opts.material ?? FRAME_MATERIALS.s235!;
  const L = 4;
  const loadN = opts.loadN ?? 2000;
  const loadType = opts.loadType ?? 'point';
  const q = loadN / L;

  const model = baseFrame('beam', section, material, [
    { id: 0, x: 0, y: 0 },
    { id: 1, x: L / 2, y: 0 },
    { id: 2, x: L, y: 0 },
  ]);
  model.beams.push(
    { id: 0, nodeI: 0, nodeJ: 1, sectionId: section.id },
    { id: 1, nodeI: 1, nodeJ: 2, sectionId: section.id },
  );
  model.supports.push({ nodeId: 0, kind: 'pin' }, { nodeId: 2, kind: 'rollerY' });
  if (loadType === 'point') model.pointLoads.push({ nodeId: 1, fx: 0, fy: -loadN });
  else model.distLoads.push({ beamId: 0, qy: -q }, { beamId: 1, qy: -q });
  return model;
}

/** 3. Kétvégén befogott gerenda: L, q (középső csomó a nyomatékkép miatt) */
export function buildFrameFixedFixed(opts: SharedOptions = {}): FrameModel {
  const section = opts.section ?? FRAME_SECTIONS.rect!;
  const material = opts.material ?? FRAME_MATERIALS.s235!;
  const L = 4;
  const loadN = opts.loadN ?? 2000;
  const q = loadN / L;

  const model = baseFrame('beam', section, material, [
    { id: 0, x: 0, y: 0 },
    { id: 1, x: L / 2, y: 0 },
    { id: 2, x: L, y: 0 },
  ]);
  model.beams.push(
    { id: 0, nodeI: 0, nodeJ: 1, sectionId: section.id },
    { id: 1, nodeI: 1, nodeJ: 2, sectionId: section.id },
  );
  model.supports.push({ nodeId: 0, kind: 'fixed' }, { nodeId: 2, kind: 'fixed' });
  model.distLoads.push({ beamId: 0, qy: -q }, { beamId: 1, qy: -q });
  return model;
}

/** 4. Portálkeret: W×H, két befogott láb, gerenda-középen P */
export function buildFramePortal(opts: SharedOptions & { span?: number; height?: number } = {}): FrameModel {
  const section = opts.section ?? FRAME_SECTIONS.rect!;
  const material = opts.material ?? FRAME_MATERIALS.s235!;
  const W = opts.span ?? 4;
  const H = opts.height ?? 2;
  const loadN = opts.loadN ?? 2000;

  const model = baseFrame('beam', section, material, [
    { id: 0, x: 0, y: 0 },
    { id: 1, x: 0, y: H },
    { id: 2, x: W / 2, y: H },
    { id: 3, x: W, y: H },
    { id: 4, x: W, y: 0 },
  ]);
  model.beams.push(
    { id: 0, nodeI: 0, nodeJ: 1, sectionId: section.id },
    { id: 1, nodeI: 1, nodeJ: 2, sectionId: section.id },
    { id: 2, nodeI: 2, nodeJ: 3, sectionId: section.id },
    { id: 3, nodeI: 4, nodeJ: 3, sectionId: section.id },
  );
  model.supports.push({ nodeId: 0, kind: 'fixed' }, { nodeId: 4, kind: 'fixed' });
  model.pointLoads.push({ nodeId: 2, fx: 0, fy: -loadN });
  return model;
}

/**
 * 5. Rácsos híd (rácstartó): 8 mező, A0 pin + F8 görgő, P a középső alsó csomón.
 * FONTOS: node.id === tömbindex (lásd frame.ts dof()-indexelés).
 */
export function buildFrameTrussBridge(opts: SharedOptions & { span?: number; height?: number; panels?: number } = {}): FrameModel {
  const section = opts.section ?? rectSection(0.01, 0.05, 'barRect', '10×50 mm');
  const material = opts.material ?? FRAME_MATERIALS.s235!;
  const span = opts.span ?? 8;
  const height = opts.height ?? 1.2;
  const panels = opts.panels ?? 8;
  const loadN = opts.loadN ?? 5000;

  const dx = span / panels;
  const n = panels + 1;
  const nodes = [];
  // FONTOS: node.id === tömbindex (lásd frame.ts dof()/geometria-indexelés).
  // Előbb az összes alsó öv (id 0..n-1), majd a felső öv (id n..2n-1).
  for (let i = 0; i < n; i++) {
    nodes.push({ id: i, x: i * dx, y: 0 }); // alsó öv
  }
  for (let i = 0; i < n; i++) {
    nodes.push({ id: n + i, x: i * dx, y: height }); // felső öv
  }

  const beams: FrameBeam[] = [];
  let eid = 0;
  // Alsó és felső öv-rudak
  for (let i = 0; i < panels; i++) {
    beams.push({ id: eid++, nodeI: i, nodeJ: i + 1, sectionId: section.id }); // alsó
    beams.push({ id: eid++, nodeI: n + i, nodeJ: n + i + 1, sectionId: section.id }); // felső
  }
  // Függőlegesek és átlók (Pratt): vertikális minden csomón, átló páronként
  for (let i = 0; i < n; i++) {
    beams.push({ id: eid++, nodeI: i, nodeJ: n + i, sectionId: section.id });
  }
  for (let i = 0; i < panels; i++) {
    if (i % 2 === 0) {
      beams.push({ id: eid++, nodeI: i, nodeJ: n + i + 1, sectionId: section.id }); // felfelé
    } else {
      beams.push({ id: eid++, nodeI: i + 1, nodeJ: n + i, sectionId: section.id }); // lefelé
    }
  }
  // Összeszámítás: 8+8 alsó/felső + 9 függő + 8 átló = 33 rúd
  if (beams.length !== 33) throw new Error(`Rács váz: várható 33 rúd, kapott ${beams.length}`);

  const midOuter = Math.floor(panels / 2);
  const midBottom = nodes.find((nd) => nd.id === midOuter)!;

  const model: FrameModel = {
    memberType: 'bar',
    nodes,
    beams,
    supports: [
      { nodeId: 0, kind: 'pin' },
      { nodeId: panels, kind: 'rollerY' },
    ],
    pointLoads: [{ nodeId: midBottom.id, fx: 0, fy: -loadN } as FramePointLoad],
    distLoads: [],
    sections: { [section.id]: section },
    material,
  };
  return model;
}

// ————— Segít —————

function baseFrame(
  memberType: 'beam' | 'bar',
  section: FrameSection,
  material: FrameMaterial,
  nodes: { id: number; x: number; y: number }[],
): FrameModel {
  return {
    memberType,
    nodes,
    beams: [],
    supports: [],
    pointLoads: [],
    distLoads: [],
    sections: { [section.id]: section },
    material,
  };
}