/**
 * ElemLab FEM-mag — közös típusok
 * Egységek: hossz [m], erő [N], feszültség [Pa], modulus [Pa]
 */

/** 2D vektor / pont */
export interface Vec2 {
  x: number;
  y: number;
}

/** Háló csomópont */
export interface Node {
  id: number;
  x: number;
  y: number;
}

/**
 * Háromszögelem.
 * CST: 3 csomópont (sorrend CCW — pozitív terület).
 * T6: 6 csomópont — 3 sarok + 3 oldalközép: [a, b, c, m_ab, m_bc, m_ca],
 *     ahol N4 = m_ab (1-2 él), N5 = m_bc (2-3 él), N6 = m_ca (3-1 él).
 */
export interface Element {
  id: number;
  nodes: [number, number, number, ...number[]];
}

/** Lineárisan rugalmas anyag */
export interface Material {
  /** Név, pl. „S235 acél" */
  name: string;
  /** Young-modulus E [Pa] */
  E: number;
  /** Poisson-tényező ν [-] */
  nu: number;
  /** Sűrűség ρ [kg/m³] — dinamikai bővítéshez, most még nem használt */
  density?: number;
}

/** Peremfeltételek */
export interface BoundaryConditions {
  /** Rögzített csomópont-id-k (mindkét szabadsági fok) */
  fixed: number[];
  /** Csomópont-id → csomóponti erő [N] */
  loads: Record<number, Vec2>;
  /** Csak vízszintes (X) rögzítés — vízszintes görgő/fal (opcionális) */
  rollerX?: number[];
  /** Csak függőleges (Y) rögzítés — függőleges támasz/görgő (opcionális) */
  rollerY?: number[];
  /** Elosztott terhelés szakaszokon: qy [N/m] (a +y irány pozitív), a lemez vastagságával szorzódik */
  distributed?: Array<{ x1: number; y1: number; x2: number; y2: number; qy: number }>;
}

/** 2D háló síkfeszültség- vagy síkfeszültség-állapottal */
export interface Mesh {
  nodes: Node[];
  elements: Element[];
  material: Material;
  /** Lemezvastagság t [m] */
  thickness: number;
  bc: BoundaryConditions;
  /** síkfeszültség (vékony lemez) vagy síkdeformáció (vastag test) */
  type: 'plane-stress' | 'plane-strain';
  /** Elem-típus: CST (lineáris, 3 csomópont) vagy T6 (kvadratikus, 6 csomópont) */
  elementType?: 'CST' | 'T6';
  /** Rajz-annotációk metaadatai (méretvonalak, infópanel) — opcionális */
  annotation?: MeshAnnotation;
}

/** Modell-leíró metaadatok a canvason való megjelenítéshez */
export interface MeshAnnotation {
  /** Keresztmetszet leírás, pl. „t×H = 20×400 mm" vagy „lemez t = 5 mm" */
  section?: string;
  /** Geometria-információ, pl. „L = 2 m · konzol" */
  geom?: string;
  /** Statikai séma leírás, pl. „befogás + P pontterhelés" */
  statics?: string;
  /** Körlyukak (Ø méretvonalhoz) */
  holes?: Array<{ cx: number; cy: number; r: number }>;
  /** Támasz-szimbólumok */
  supports?: Array<{
    x: number;
    y: number;
    kind: 'fixed' | 'pin' | 'rollerX' | 'rollerY';
    /** a szimbólum iránya (a szerkezet felé mutat) */
    dir?: 'up' | 'down' | 'left' | 'right';
  }>;
  /** Pontterhelés-nyilak (séma-jelleg, nem node-on-node) */
  pointLoads?: Array<{ x: number; y: number; fx: number; fy: number; label?: string }>;
  /** Elosztott terhelés sémája */
  distLoads?: Array<{ x1: number; y1: number; x2: number; y2: number; qy: number }>;
}

/** Egy elem feszültségállapota */
export interface ElementStress {
  /** Normál feszültség σx [Pa] */
  sigmaX: number;
  /** Normál feszültség σy [Pa] */
  sigmaY: number;
  /** Nyíró feszültség τxy [Pa] */
  tauXY: number;
  /** Von Mises összehasonlító feszültség [Pa] */
  vonMises: number;
}

/** Teljes megoldás eredménye */
export interface SolutionResult {
  /** csomópont-id → [ux, uy] elmozdulás [m] */
  displacements: Map<number, Vec2>;
  /** elem-id → feszültségállapot */
  stresses: Map<number, ElementStress>;
  /** csomópont-id → reakcióerő [N] (csak rögzített csomópontokon) */
  reactions: Map<number, Vec2>;
  /** Globális max elmozdulás nagysága [m] */
  maxDisplacement: number;
  /** Globális max Von Mises feszültség [Pa] */
  maxVonMises: number;
  /** CG-szolver iterációszáma */
  iterations: number;
  /** Elért relatív maradék */
  residual: number;
}
