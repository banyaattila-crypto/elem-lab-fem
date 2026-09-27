/**
 * Rúd/csomópont-vizsgálat vázmodellekhez (frame.ts megoldó szerint).
 * Ugyanaz a mp-section stílus, mint a lemez-mathpanel, de 1D képletekkel:
 *  - rúd: N, M1, M2, V1, V2, σ_top/bot (N/A ± M/W)
 *  - csomópont: u, v, θ + reakciók (Rₓ, R_y, M)
 */

import katex from 'katex';
import type { FrameModel, FrameReaction, FrameSolution } from '../fem/frame';
import { fmt } from './mathpanel';

export interface FrameElementInspection {
  beamId: number;
  nodeI: number;
  nodeJ: number;
  sectionName: string;
  sectionId: string;
  materialName: string;
  L: number;
  A: number;
  I: number;
  W: number;
  E: number;
  N: number;
  M1: number;
  M2: number;
  V1: number;
  V2: number;
  sigmaTop: number;
  sigmaBot: number;
  midM: number;
}

export interface FrameNodeInspection {
  nodeId: number;
  x: number;
  y: number;
  u: number;
  v: number;
  theta: number;
  rx: number;
  ry: number;
  m: number;
  supportKind: string;
}

export function inspectFrameElement(model: FrameModel, sol: FrameSolution, beamId: number): FrameElementInspection {
  const beam = model.beams.find((b) => b.id === beamId);
  if (!beam) throw new Error(`Nincs ${beamId} id-jú rúd`);
  const ni = model.nodes[beam.nodeI]!;
  const nj = model.nodes[beam.nodeJ]!;
  const section = model.sections[beam.sectionId]!;
  const res = sol.beams.get(beamId);
  if (!res) throw new Error(`Nincs megoldás a ${beamId} rúdhoz`);
  const samples = res.samples;
  const mid = samples[Math.floor((samples.length - 0.5) / 2)] ?? samples[0]!;
  return {
    beamId,
    nodeI: beam.nodeI,
    nodeJ: beam.nodeJ,
    sectionName: section.name,
    sectionId: section.id,
    materialName: model.material.name,
    L: Math.hypot(nj.x - ni.x, nj.y - ni.y),
    A: section.A,
    I: section.Iy,
    W: section.Wy,
    E: model.material.E,
    N: res.N,
    M1: res.M1,
    M2: res.M2,
    V1: res.V1,
    V2: res.V2,
    sigmaTop: Math.max(...samples.map((s) => Math.abs(s.sigmaTop))),
    sigmaBot: Math.max(...samples.map((s) => Math.abs(s.sigmaBot))),
    midM: mid.M,
  };
}

function supportKindLabel(kind: string): string {
  switch (kind) {
    case 'fixed':
      return 'befogott (2D rögzített)';
    case 'pin':
      return 'csukló (pin)';
    case 'rollerY':
      return 'görgő / függőleges görgő';
    case 'rollerX':
      return 'vízszintes görgő';
    case 'spring':
      return 'rugótámasz';
    default:
      return 'nincs támasz';
  }
}

/** Csomóponti reakció-lekérés: adott támaszon a legutóbbi megoldás reakciója */
export function frameReactionAt(_model: FrameModel, sol: FrameSolution, nodeId: number): FrameReaction | undefined {
  return sol.reactions.get(nodeId);
}

export function inspectFrameNode(model: FrameModel, sol: FrameSolution, nodeId: number): FrameNodeInspection {
  const node = model.nodes[nodeId];
  if (!node) throw new Error(`Nincs ${nodeId} id-jú csomópont`);
  const d = sol.displacements.get(nodeId) ?? { u: 0, v: 0, theta: 0 };
  const r = sol.reactions.get(nodeId);
  const sup = model.supports.find((s) => s.nodeId === nodeId);
  return {
    nodeId,
    x: node.x,
    y: node.y,
    u: d.u,
    v: d.v,
    theta: d.theta,
    rx: r?.x ?? 0,
    ry: r?.y ?? 0,
    m: r?.m ?? 0,
    supportKind: sup ? supportKindLabel(sup.kind) : 'nincs támasz',
  };
}

function disp(s: string): string {
  return katex.renderToString(s, { throwOnError: false, displayMode: true });
}

function section(icon: string, title: string, body: string): string {
  return '<div class="mp-section"><h3><span class="mp-icon">' + icon + '</span>' + title + '</h3>' + body + '</div>';
}

const L = (hu: boolean) => (h: string, e: string): string => (hu ? h : e);

export function renderFrameElementInspection(
  insp: FrameElementInspection,
  lang: 'hu' | 'en',
): string {
  const T = L(lang === 'hu');

  // 1. Geometria
  const geo = section(
    '📐',
    T('1. Geometria — rúd ' + insp.beamId, '1. Geometry — member ' + insp.beamId),
    '<p>' +
      T(
        `A rúd a ${insp.nodeI} → ${insp.nodeJ} csomópontok között, L = ${fmt.num(insp.L)} m. Szelvény: ${insp.sectionName}.`,
        `The member spans nodes ${insp.nodeI} → ${insp.nodeJ}, L = ${fmt.num(insp.L)} m. Section: ${insp.sectionName}.`,
      ) +
      '</p>' +
      disp(
        '\\begin{aligned}L&=' + fmt.num(insp.L) + '\\,\\text{m}\\\\A&=' + fmt.area(insp.A) + '\\text{m}^2\\\\I_y&=' + fmt.num(insp.I, 4) + '\\,\\text{m}^4\\\\W_y&=' + fmt.num(insp.W, 6) + '\\,\\text{m}^3\\end{aligned}',
      ),
  );

  // 2. Anyag
  const mat = section(
    '🧪',
    T('2. Anyag: ' + insp.materialName, '2. Material: ' + insp.materialName),
    disp('E=' + fmt.pa(insp.E)),
  );

  // 3. Belső erők
  const inner = section(
    '⚙️',
    T('3. Belső erők (visszanyerés)', '3. Internal forces (element recovery)'),
    '<p>' +
      T(
        'Az elemi merevség és a csomóponti elmozdulások szorzatából, a megoszló teher konzisztens erővektorával korrigálva:',
        'From element stiffness × nodal displacements, corrected by the consistent load vector of the distributed load:',
      ) +
      '</p>' +
      disp(
        'N=\\frac{EA}{L}(u_J-u_I)=' + fmt.num(insp.N, 2) + '\\,\\text{N}',
      ) +
      disp(
        'M_1=' + fmt.num(insp.M1, 2) + '\\,\\text{Nm},\\quad M_2=' + fmt.num(insp.M2, 2) + '\\,\\text{Nm}',
      ) +
      disp(
        'V_1=' + fmt.num(insp.V1, 2) + '\\,\\text{N},\\quad V_2=' + fmt.num(insp.V2, 2) + '\\,\\text{N}',
      ) +
      '<ul class="mp-list">' +
      '<li>N = <strong>' + fmt.num(insp.N, 1) + ' N</strong> (' + T('húzás + / nyomás −', 'tension + / compression −') + ')</li>' +
      '<li>M_közép = <strong>' + fmt.num(insp.midM, 1) + ' Nm</strong></li>' +
      '<li>V₁ = <strong>' + fmt.num(insp.V1, 1) + ' N</strong>, V₂ = <strong>' + fmt.num(insp.V2, 1) + ' N</strong></li>' +
      '</ul>',
  );

  // 4. Feszültség
  const sig = section(
    '💥',
    T('4. Szélsőszál-feszültség', '4. Extreme-fibre stress'),
    '<p>' +
      T(
        'A hajlításból és a normálerőből (nyírás járulékát elhanyagoljuk):',
        'From bending and normal force (shear contribution neglected):',
      ) +
      '</p>' +
      disp(
        '\\sigma_{\\text{top}}=\\frac{N}{A}-\\frac{M}{W_y},\\quad \\sigma_{\\text{bot}}=\\frac{N}{A}+\\frac{M}{W_y}',
      ) +
      '<ul class="mp-list">' +
      '<li>|σ_top| = <strong>' + fmt.pa(insp.sigmaTop) + '</strong></li>' +
      '<li>|σ_bot| = <strong>' + fmt.pa(insp.sigmaBot) + '</strong> ' + T('(a sáv-színezés max. értéke)', '(the band is colored by this max)') + '</li>' +
      '</ul>',
  );

  return geo + mat + inner + sig;
}

export function renderFrameNodeInspection(
  insp: FrameNodeInspection,
  lang: 'hu' | 'en',
): string {
  const T = L(lang === 'hu');
  const inspNode = section(
    '📌',
    T('Csomópont-vizsgálat #' + insp.nodeId, 'Node inspection #' + insp.nodeId),
    '<p>' +
      T(
        'Helyzet: (' + fmt.num(insp.x) + ', ' + fmt.num(insp.y) + ') m · ' + insp.supportKind + '.',
        'Position: (' + fmt.num(insp.x) + ', ' + fmt.num(insp.y) + ') m · ' + insp.supportKind + '.',
      ) +
      '</p>' +
      disp(
        '\\begin{aligned}u&=' + fmt.num(insp.u, 6) + '\\,\\text{m}\\\\v&=' + fmt.num(insp.v, 6) + '\\,\\text{m}\\\\\\theta&=' + fmt.num(insp.theta, 6) + '\\,\\text{rad}\\end{aligned}',
      ) +
      '<ul class="mp-list">' +
      '<li>u = <strong>' + fmt.num(insp.u, 6) + ' m</strong></li>' +
      '<li>v = <strong>' + fmt.num(insp.v, 6) + ' m</strong></li>' +
      '<li>θ = <strong>' + fmt.num(insp.theta, 6) + ' rad</strong></li>' +
      '</ul>' +
      (insp.supportKind === 'nincs támasz' || insp.supportKind === 'None'
        ? ''
        : disp(
            'R_x=' + fmt.num(insp.rx, 2) + '\\,\\text{N},\\quad R_y=' + fmt.num(insp.ry, 2) + '\\,\\text{N},\\quad M=' + fmt.num(insp.m, 2) + '\\,\\text{Nm}' +
            T(': Rₓ, R_y, M egysége N ill. Nm', ': Rₓ, R_y, M in N and Nm respectively'),
          )
      ),
  );
  return inspNode;
}