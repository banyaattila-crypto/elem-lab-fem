/**
 * ElemLab váz-mag — 1D rúd/rács megoldó (Euler–Bernoulli + rácsrúd).
 *
 * Spec: docs/2d-fem-terv.md (3. és 4. fejezet).
 *  - 'beam' modell: 3 szabadsági fok/csomópont (u, v, θ), globális DOF = 3n, 3n+1, 3n+2
 *  - 'bar' modell: 2 szabadsági fok/csomópont (u, v),         globális DOF = 2n, 2n+1
 *  - a két elem-típus nem keverhető (konzisztens DOF-rendszer)
 *
 * Előjelek:
 *  - globális y felfelé; v fel pozitív, θ = dv/dx (CCW+)
 *  - a lokális x az i → j irány, a lokális y = (−s, c) (iránykoszinuszok c, s)
 *  - M(x) sagging-konvencióban (pozitív = alsó szál húzott), V = dM/dx
 *  - N (húzás) pozitív = EA/L · (u_j − u_i)
 *
 * Egységek: hossz [m], erő [N], nyomaték [Nm], feszültség [Pa], modulus [Pa].
 */

import { SparseMatrix, conjugateGradient } from './linalg';

// ————— Adat-struktúrák —————
// A terv 2.2 "Entitások" alfejezetének tükörképe.

export interface FrameNode {
  id: number;
  x: number;
  y: number;
}

export interface FrameSection {
  id: string;
  name: string;
  /** Keresztmetszeti terület [m²] */
  A: number;
  /** Másodrendű nyomaték a hajlítási tengelyre [m⁴] */
  Iy: number;
  /** Hajlítási ellenállás [m³] */
  Wy: number;
  /** Magasság [m] — rajz/leírás */
  h: number;
  /** Szélesség [m] — leírás */
  b: number;
}

export interface FrameMaterial {
  name: string;
  E: number;
  nu: number;
  rho: number;
  /** Folyáshatár [Pa] — a σ ≤ fy kihasználtsághoz */
  fy: number;
}

/** Támasz-típusok (terv 4. fejezet). A 'spring' a v-dof diagonáljába kerül. */
export type FrameSupportKind = 'pin' | 'fixed' | 'rollerY' | 'rollerX' | 'spring';

export interface FrameSupport {
  nodeId: number;
  kind: FrameSupportKind;
  /** Rugó-merevség [N/m] (csak 'spring' esetén) */
  kY?: number;
}

export interface FramePointLoad {
  nodeId: number;
  fx: number;
  fy: number;
  /** Csomóponti nyomaték [Nm] — csak 'beam' modelleknél */
  m?: number;
}

export interface FrameDistLoad {
  beamId: number;
  /** Globális y irányú megoszló terhelés [N/m]; lefelé negatív */
  qy: number;
}

export interface FrameBeam {
  id: number;
  nodeI: number;
  nodeJ: number;
  sectionId: string;
}

export interface FrameModel {
  nodes: FrameNode[];
  beams: FrameBeam[];
  /** 'beam' = 3 DOF/csomópont, 'bar' = 2 DOF/csomópont — rögzített egész modellre */
  memberType: 'beam' | 'bar';
  supports: FrameSupport[];
  pointLoads: FramePointLoad[];
  distLoads: FrameDistLoad[];
  sections: Record<string, FrameSection>;
  material: FrameMaterial;
}

// ————— Megoldás-típusok —————

export interface FrameNodeDisp {
  u: number;
  v: number;
  theta: number;
}

export interface FrameReaction {
  x: number;
  y: number;
  /** Reakciónyomaték [Nm] — befogásnál nem nulla (terv 4. fejezet) */
  m: number;
}

/** Egy rúd belső erő- és feszültség-mintája s ∈ [0..L] mentén */
export interface FrameSample {
  s: number;
  N: number;
  M: number;
  V: number;
  sigmaTop: number;
  sigmaBot: number;
}

export interface FrameBeamResult {
  beamId: number;
  /** Axiális erő [N] (húzás +) */
  N: number;
  /** Végnjomatékok sagging-konvencióval [Nm] */
  M1: number;
  M2: number;
  /** Nyíróerő a végeken [N] (V = dM/dx) */
  V1: number;
  V2: number;
  samples: FrameSample[];
}

export interface FrameSolution {
  displacements: Map<number, FrameNodeDisp>;
  reactions: Map<number, FrameReaction>;
  beams: Map<number, FrameBeamResult>;
  maxDisplacement: number;
  maxStress: number;
  maxN: number;
  maxM: number;
  maxV: number;
  iterations: number;
  residual: number;
}

export interface FrameSolveOptions {
  tol?: number;
  /** Diagram/feszültség-mintavételezés rúdonként (a density csúszka vezérli) */
  samplesPerBeam?: number;
}

// ————— Elemi merevségi mátrixok (terv 3.1, 3.4) —————

/** Euler–Bernoulli rúd lokális 6×6-os merevsége: [u1,v1,θ1,u2,v2,θ2] */
export function beamStiffnessLocal(L: number, E: number, A: number, I: number): number[][] {
  const c = (E * A) / L;
  const d1 = (12 * E * I) / (L * L * L);
  const d2 = (6 * E * I) / (L * L);
  const m1 = (4 * E * I) / L;
  const m2 = (2 * E * I) / L;
  return [
    [c, 0, 0, -c, 0, 0],
    [0, d1, d2, 0, -d1, d2],
    [0, d2, m1, 0, -d2, m2],
    [-c, 0, 0, c, 0, 0],
    [0, -d1, -d2, 0, d1, -d2],
    [0, d2, m2, 0, -d2, m1],
  ];
}

/** Rácsrúd lokális 2×2-es merevsége: [u1, u2] */
export function barStiffnessLocal(L: number, E: number, A: number): number[][] {
  const a = (E * A) / L;
  return [
    [a, -a],
    [-a, a],
  ];
}

/** Globális → lokális transzformáció (terv 3.2) */
export function frameRotationMat(c: number, s: number): number[][] {
  return [
    [c, s, 0, 0, 0, 0],
    [-s, c, 0, 0, 0, 0],
    [0, 0, 1, 0, 0, 0],
    [0, 0, 0, c, s, 0],
    [0, 0, 0, -s, c, 0],
    [0, 0, 0, 0, 0, 1],
  ];
}

/** Rács-rúd (bar) transzformációs téglalap: [u1,v1,u2,v2] → [ū1, ū2] */
function barRotationMat(c: number, s: number): number[][] {
  return [
    [c, s, 0, 0],
    [0, 0, c, s],
  ];
}

function matMul(A: number[][], B: number[][]): number[][] {
  const n = A.length;
  const m = B[0]!.length;
  const k = B.length;
  const R = Array.from({ length: n }, () => new Array<number>(m).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < m; j++) {
      let sum = 0;
      for (let p = 0; p < k; p++) sum += A[i]![p]! * B[p]![j]!;
      R[i]![j] = sum;
    }
  }
  return R;
}

function matT(A: number[][]): number[][] {
  const n = A.length;
  const m = A[0]!.length;
  const R = Array.from({ length: m }, () => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) R[j]![i] = A[i]![j]!;
  return R;
}

// ————— Összeállítás —————

interface DrawnBeam {
  L: number;
  c: number;
  s: number;
  qa: number; // lokális axiális megoszló [N/m]
  qt: number; // lokális keresztirányú megoszló [N/m]
}

function beamGeometry(model: FrameModel, beam: FrameBeam): DrawnBeam {
  const ni = model.nodes[beam.nodeI]!;
  const nj = model.nodes[beam.nodeJ]!;
  const dx = nj.x - ni.x;
  const dy = nj.y - ni.y;
  const L = Math.hypot(dx, dy);
  const c = dx / L;
  const s = dy / L;
  // Globális függőleges (y) teher lokális komponensei:
  //  - keresztirány: qy · c   (e_y·q)
  //  - axiális:      qy · s   (e_x·q)
  const load = model.distLoads.find((d) => d.beamId === beam.id);
  const qy = load ? load.qy : 0;
  return { L, c, s, qa: qy * s, qt: qy * c };
}

function assembleFrame(model: FrameModel): {
  K: SparseMatrix;
  f: Float64Array;
  fixedDofs: number[];
  springDofs: number[];
  n: number;
} {
  const per = model.memberType === 'beam' ? 3 : 2;
  const n = per * model.nodes.length;
  const dof = (nodeId: number, comp: number): number => per * nodeId + comp;
  const triplets: Array<[number, number, number]> = [];
  const f = new Float64Array(n);

  const E = model.material.E;

  for (const beam of model.beams) {
    const geo = beamGeometry(model, beam);
    const section = model.sections[beam.sectionId]!;
    if (model.memberType === 'beam') {
      const k = beamStiffnessLocal(geo.L, E, section.A, section.Iy);
      const T = frameRotationMat(geo.c, geo.s);
      const ke = matMul(matMul(matT(T), k), T);
      // Konzisztens tehervektor (terv 3.3)
      const feq = [
        (geo.qa * geo.L) / 2,
        (geo.qt * geo.L) / 2,
        (geo.qt * geo.L * geo.L) / 12,
        (geo.qa * geo.L) / 2,
        (geo.qt * geo.L) / 2,
        -(geo.qt * geo.L * geo.L) / 12,
      ];
      const fe = matVec6(matT(T), feq);
      const dofs = [
        dof(beam.nodeI, 0),
        dof(beam.nodeI, 1),
        dof(beam.nodeI, 2),
        dof(beam.nodeJ, 0),
        dof(beam.nodeJ, 1),
        dof(beam.nodeJ, 2),
      ];
      for (let i = 0; i < 6; i++) {
        f[dofs[i]!]! += fe[i]!;
        for (let j = 0; j < 6; j++) {
          const v = ke[i]![j]!;
          if (v !== 0) triplets.push([dofs[i]!, dofs[j]!, v]);
        }
      }
    } else {
      const k = barStiffnessLocal(geo.L, E, section.A);
      const Tb = barRotationMat(geo.c, geo.s);
      const ke = matMul(matMul(matT(Tb), k), Tb);
      // Axiális megoszló (a bar ezt viszi át)
      const feqLoc = [(geo.qa * geo.L) / 2, (geo.qa * geo.L) / 2];
      const fe = mat2x4Vec(matT(Tb), feqLoc);
      const dofs = [dof(beam.nodeI, 0), dof(beam.nodeI, 1), dof(beam.nodeJ, 0), dof(beam.nodeJ, 1)];
      for (let i = 0; i < 4; i++) {
        f[dofs[i]!]! += fe[i]!;
        for (let j = 0; j < 4; j++) {
          const v = ke[i]![j]!;
          if (v !== 0) triplets.push([dofs[i]!, dofs[j]!, v]);
        }
      }
    }
  }

  // Pontterhelések (terv 5. fejezet)
  for (const p of model.pointLoads) {
    f[dof(p.nodeId, 0)]! += p.fx;
    f[dof(p.nodeId, 1)]! += p.fy;
    if (model.memberType === 'beam' && p.m !== undefined) f[dof(p.nodeId, 2)]! += p.m;
  }

  // Rugó-támaszok: a diagonálba (K_dd += k), a DOF szabad marad
  const springDofs: number[] = [];
  for (const sup of model.supports) {
    if (sup.kind === 'spring' && sup.kY) {
      triplets.push([dof(sup.nodeId, 1), dof(sup.nodeId, 1), sup.kY]);
      springDofs.push(dof(sup.nodeId, 1));
    }
  }

  const fixedDofs: number[] = [];
  for (const sup of model.supports) {
    switch (sup.kind) {
      case 'rollerY':
        fixedDofs.push(dof(sup.nodeId, 1));
        break;
      case 'rollerX':
        fixedDofs.push(dof(sup.nodeId, 0));
        break;
      case 'pin':
        fixedDofs.push(dof(sup.nodeId, 0), dof(sup.nodeId, 1));
        break;
      case 'fixed':
        fixedDofs.push(dof(sup.nodeId, 0), dof(sup.nodeId, 1));
        if (per === 3) fixedDofs.push(dof(sup.nodeId, 2));
        break;
      default:
        break;
    }
  }

  const K = SparseMatrix.fromCOO(n, triplets);
  return { K, f, fixedDofs, springDofs, n };
}

function matVec6(M: number[][], v: number[]): number[] {
  return M.map((row) => row[0]! * v[0]! + row[1]! * v[1]! + row[2]! * v[2]! + row[3]! * v[3]! + row[4]! * v[4]! + row[5]! * v[5]!);
}

function mat2x4Vec(M: number[][], v: number[]): number[] {
  return M.map((row) => row.reduce((acc, val, j) => acc + (val ?? 0) * (v[j] ?? 0), 0));
}

/** A kötött DOF-ok kihagyása: K_ff · u_f = f_f (a solve.ts partition() mintája) */
function partitionFrame(
  K: SparseMatrix,
  f: Float64Array,
  fixedDofs: number[],
): { Kff: SparseMatrix; ff: Float64Array; freeDofs: number[] } {
  const fixed = new Set(fixedDofs);
  const freeDofs: number[] = [];
  for (let i = 0; i < K.n; i++) {
    if (!fixed.has(i)) freeDofs.push(i);
  }
  const newIndex = new Map<number, number>();
  freeDofs.forEach((dof, idx) => newIndex.set(dof, idx));

  const triplets: Array<[number, number, number]> = [];
  for (let i = 0; i < K.n; i++) {
    if (fixed.has(i)) continue;
    for (let kIdx = K.rowPtr[i]!; kIdx < K.rowPtr[i + 1]!; kIdx++) {
      const j = K.colIdx[kIdx]!;
      if (!fixed.has(j)) {
        triplets.push([newIndex.get(i)!, newIndex.get(j)!, K.values[kIdx]!]);
      }
    }
  }
  const ff = new Float64Array(freeDofs.length);
  freeDofs.forEach((dof, idx) => {
    ff[idx] = f[dof]!;
  });
  return { Kff: SparseMatrix.fromCOO(freeDofs.length, triplets), ff, freeDofs };
}

// ————— Megoldás —————

export function solveFrame(model: FrameModel, opts: FrameSolveOptions = {}): FrameSolution {
  const tol = opts.tol ?? 1e-10;
  const per = model.memberType === 'beam' ? 3 : 2;
  const samplesPerBeam = opts.samplesPerBeam ?? 8;

  const { K, f, fixedDofs, springDofs, n } = assembleFrame(model);
  const { Kff, ff, freeDofs } = partitionFrame(K, f, fixedDofs);

  // Vázrendszerek kicsik, de rosszul kondicionáltak (a rács övei) — adjunk
  // iterációs pótlékot a dof-számon túlra (CG < n lépés elméletben elég).
  const cg = conjugateGradient(Kff, ff, { tol, maxIter: Math.max(Kff.n * 4, 1000) });

  const uFull = new Float64Array(n);
  freeDofs.forEach((dof, idx) => {
    uFull[dof] = cg.x[idx]!;
  });

  // ————— Elmozdulások —————
  const displacements = new Map<number, FrameNodeDisp>();
  let maxDisplacement = 0;
  for (const node of model.nodes) {
    const u = uFull[per * node.id]!;
    const v = uFull[per * node.id + 1]!;
    const theta = per === 3 ? uFull[per * node.id + 2]! : 0;
    displacements.set(node.id, { u, v, theta });
    const mag = Math.hypot(u, v);
    if (mag > maxDisplacement) maxDisplacement = mag;
  }

  // ————— Reakcióerők: R = K·u − f a kötött DOF-okon (+ rugó  R = k·v) —————
  const reactions = new Map<number, FrameReaction>();
  const springSet = new Set(springDofs);
  const constrained = new Set([...fixedDofs, ...springDofs]);
  for (const dof of constrained) {
    let r: number;
    const nodeId = Math.floor(dof / per);
    const comp = dof % per;
    if (springSet.has(dof)) {
      // A rugó a szabad rendszerben él: a reakció a rugó által a szerkezetre
      // kifejtett erő = −k·v (a visszatérítő erő ellentétes az elmozdulással).
      const spring = model.supports.find(
        (sup) => sup.kind === 'spring' && sup.nodeId === nodeId,
      );
      r = -(spring?.kY ?? 0) * uFull[dof]!;
    } else {
      r = -f[dof]!;
      for (let kIdx = K.rowPtr[dof]!; kIdx < K.rowPtr[dof + 1]!; kIdx++) {
        r += K.values[kIdx]! * uFull[K.colIdx[kIdx]!]!;
      }
    }
    const prev = reactions.get(nodeId) ?? { x: 0, y: 0, m: 0 };
    if (comp === 0) prev.x = r;
    else if (comp === 1) prev.y = r;
    else prev.m = r;
    reactions.set(nodeId, prev);
  }

  // ————— Utófeldolgozás rúdonként (terv 3.5) —————
  const E = model.material.E;
  const beams = new Map<number, FrameBeamResult>();
  let maxStress = 0;
  let maxN = 0;
  let maxM = 0;
  let maxV = 0;

  for (const beam of model.beams) {
    const section = model.sections[beam.sectionId]!;
    const geo = beamGeometry(model, beam);

    if (model.memberType === 'beam') {
      const dGlob = [
        uFull[per * beam.nodeI]!,
        uFull[per * beam.nodeI + 1]!,
        uFull[per * beam.nodeI + 2]!,
        uFull[per * beam.nodeJ]!,
        uFull[per * beam.nodeJ + 1]!,
        uFull[per * beam.nodeJ + 2]!,
      ];
      const T = frameRotationMat(geo.c, geo.s);
      const dLoc = matVec6(T, dGlob);

      const k = beamStiffnessLocal(geo.L, E, section.A, section.Iy);
      const feq = [
        (geo.qa * geo.L) / 2,
        (geo.qt * geo.L) / 2,
        (geo.qt * geo.L * geo.L) / 12,
        (geo.qa * geo.L) / 2,
        (geo.qt * geo.L) / 2,
        -(geo.qt * geo.L * geo.L) / 12,
      ];
      const Fend = k.map((row, i) =>
        row[0]! * dLoc[0]! + row[1]! * dLoc[1]! + row[2]! * dLoc[2]! + row[3]! * dLoc[3]! + row[4]! * dLoc[4]! + row[5]! * dLoc[5]! - feq[i]!,
      );

      const M1 = -Fend[2]!;
      const M2 = Fend[5]!;
      const ql = geo.qt;
      // V = dM/dx: V1 = V(0), V2 = V(L)
      const V1 = (M2 - M1) / geo.L + (-ql * geo.L) / 2;
      const V2 = (M2 - M1) / geo.L + (ql * geo.L) / 2;
      // N húzás-pozitív (konzisztens a bar-jellel)
      const N = (E * section.A) / geo.L * (dLoc[3]! - dLoc[0]!);

      const samples: FrameSample[] = [];
      for (let kIdx = 0; kIdx <= samplesPerBeam; kIdx++) {
        const s = (kIdx / samplesPerBeam) * geo.L;
        const xb = s / geo.L;
        const M = M1 * (1 - xb) + M2 * xb + (-ql) * (s * (geo.L - s)) / 2;
        const V = (M2 - M1) / geo.L + (-ql) * (geo.L - 2 * s) / 2;
        const sigmaTop = N / section.A - M / section.Wy;
        const sigmaBot = N / section.A + M / section.Wy;
        samples.push({ s, N, M, V, sigmaTop, sigmaBot });
        maxStress = Math.max(maxStress, Math.abs(sigmaTop), Math.abs(sigmaBot));
        maxN = Math.max(maxN, Math.abs(N));
        maxM = Math.max(maxM, Math.abs(M));
        maxV = Math.max(maxV, Math.abs(V));
      }
      beams.set(beam.id, { beamId: beam.id, N, M1, M2, V1, V2, samples });
    } else {
      const dGlob = [uFull[per * beam.nodeI]!, uFull[per * beam.nodeI + 1]!, uFull[per * beam.nodeJ]!, uFull[per * beam.nodeJ + 1]!];
      const Tb = barRotationMat(geo.c, geo.s);
      const dLoc = mat2x4Vec(Tb, dGlob);
      const N = (E * section.A) / geo.L * (dLoc[1]! - dLoc[0]!);
      const samples: FrameSample[] = [];
      for (let kIdx = 0; kIdx <= samplesPerBeam; kIdx++) {
        const s = (kIdx / samplesPerBeam) * geo.L;
        const sigma = N / section.A;
        samples.push({ s, N, M: 0, V: 0, sigmaTop: sigma, sigmaBot: sigma });
        maxStress = Math.max(maxStress, Math.abs(sigma));
        maxN = Math.max(maxN, Math.abs(N));
      }
      beams.set(beam.id, { beamId: beam.id, N, M1: 0, M2: 0, V1: 0, V2: 0, samples });
    }
  }

  return {
    displacements,
    reactions,
    beams,
    maxDisplacement,
    maxStress,
    maxN,
    maxM,
    maxV,
    iterations: cg.iterations,
    residual: cg.residual,
  };
}

// ————— Picking-segédek (a canvason való kattintáshoz) —————

/** Pont-vonalszakasz távolság (világ-koordinátákban) */
export function pointToSegmentSq(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-24) return (px - x1) ** 2 + (py - y1) ** 2;
  let t = ((px - x1) * dx + (py - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = x1 + t * dx;
  const cy = y1 + t * dy;
  return (px - cx) ** 2 + (py - cy) ** 2;
}

/** Legközelebbi rúd id-ja a ponthoz (tolerancia nélkül, a legközelebbit adja) */
export function findFrameBeamAt(model: FrameModel, px: number, py: number, tol = 0): number | null {
  let best = Infinity;
  let bestId: number | null = null;
  for (const beam of model.beams) {
    const ni = model.nodes[beam.nodeI]!;
    const nj = model.nodes[beam.nodeJ]!;
    const d = pointToSegmentSq(px, py, ni.x, ni.y, nj.x, nj.y);
    if (d < best) {
      best = d;
      bestId = beam.id;
    }
  }
  if (bestId == null) return null;
  return Math.sqrt(best) <= Math.max(tol, 1e-9) ? bestId : null;
}

/** Legközelebbi csomópont a ponthoz, tolerancia-sugaron belül */
export function findFrameNodeAt(model: FrameModel, px: number, py: number, tol: number): number | null {
  let best = Infinity;
  let bestId: number | null = null;
  for (const node of model.nodes) {
    const d = (node.x - px) ** 2 + (node.y - py) ** 2;
    if (d < best) {
      best = d;
      bestId = node.id;
    }
  }
  if (bestId == null) return null;
  return Math.sqrt(best) <= tol ? bestId : null;
}

/**
 * Érvényes-e egy csomópont adott helyre mozgatása? A mágneses pillanýítás
 * szándékosan könnyen összapadásra ugorhat, és egy nulla hosszú rúdnál a
 * `c = dx/L` 0/0 → NaN, ami az EGÉSZ merevességi mátrixot tönkreteszi. Ezért
 * a szerkesztés ezt előre ellenőrzi, és nem engedi a rújat összezsugorodni.
 *
 * @param minLength legkisebb megengedett rúdhossz [m]
 */
export function nodeMoveIsSafe(
  model: FrameModel,
  nodeId: number,
  x: number,
  y: number,
  minLength = 0.01,
): boolean {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  for (const beam of model.beams) {
    const otherId = beam.nodeI === nodeId ? beam.nodeJ : beam.nodeJ === nodeId ? beam.nodeI : null;
    if (otherId == null) continue;
    const other = model.nodes[otherId];
    if (!other) continue;
    if (Math.hypot(other.x - x, other.y - y) < minLength) return false;
  }
  return true;
}

/** A rúd lokális elmozduláskomponensei a rajzolóhoz (Hermite-görbe) */
export function frameBeamLocalDisp(
  model: FrameModel,
  sol: FrameSolution,
  beamId: number,
): { x1: number; y1: number; x2: number; y2: number; L: number; c: number; s: number; d: [number, number, number, number, number, number] } | null {
  const beam = model.beams.find((b) => b.id === beamId);
  if (!beam) return null;
  const ni = model.nodes[beam.nodeI]!;
  const nj = model.nodes[beam.nodeJ]!;
  const dx = nj.x - ni.x;
  const dy = nj.y - ni.y;
  const L = Math.hypot(dx, dy);
  const c = dx / L;
  const s = dy / L;
  const di = sol.displacements.get(beam.nodeI) ?? { u: 0, v: 0, theta: 0 };
  const dj = sol.displacements.get(beam.nodeJ) ?? { u: 0, v: 0, theta: 0 };
  const u1 = c * di.u + s * di.v;
  const v1 = -s * di.u + c * di.v;
  const u2 = c * dj.u + s * dj.v;
  const v2 = -s * dj.u + c * dj.v;
  return { x1: ni.x, y1: ni.y, x2: nj.x, y2: nj.y, L, c, s, d: [u1, v1, di.theta, u2, v2, dj.theta] };
}