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
 * Három csomópontú háromszögelem (CST).
 * A csomópont-id sorrendje óramutató járásával ellentétes (CCW) —
 * ez garantálja a pozitív területet és a jól kondicionált mátrixot.
 */
export interface Element {
  id: number;
  nodes: [number, number, number];
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
