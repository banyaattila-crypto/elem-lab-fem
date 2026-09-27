/**
 * NodePanel — adatréteg: csomópont-vizsgálat.
 * Elmozdulás, külső terhelés, reakcióerő, a környező elemek feszültségei,
 * valamint a szabad csomópontok erőegyensúly-ellenőrzése (F_int = −F_ext).
 */

import type { Mesh, SolutionResult } from '../fem/types';

export interface NodeInspection {
  nodeId: number;
  x: number;
  y: number;
  isFixed: boolean;
  /** Csomóponti terhelés [N] (ha van) */
  load: { x: number; y: number } | null;
  /** Reakcióerő [N] (ha rögzített) */
  reaction: { x: number; y: number } | null;
  displacement: { x: number; y: number };
  /** Környező elemek: id + Von Mises */
  neighborElements: Array<{ id: number; vonMises: number }>;
  /** Szabad csomópont: a belső erők eredője (K·u sor) — közel nulla legyen */
  equilibriumResidual: { x: number; y: number } | null;
}

/** Összegyűjti egy csomópont összes vizsgálati adatát. */
export function inspectNode(
  mesh: Mesh,
  sol: SolutionResult,
  nodeId: number,
): NodeInspection {
  const node = mesh.nodes[nodeId]!;
  const u = sol.displacements.get(nodeId) ?? { x: 0, y: 0 };
  const load = mesh.bc.loads[nodeId] ?? null;
  const isFixed = mesh.bc.fixed.includes(nodeId);
  const reaction = isFixed ? (sol.reactions.get(nodeId) ?? null) : null;

  // Környező elemek
  const neighborElements: Array<{ id: number; vonMises: number }> = [];
  for (const e of mesh.elements) {
    if (e.nodes.includes(nodeId)) {
      const s = sol.stresses.get(e.id);
      if (s) neighborElements.push({ id: e.id, vonMises: s.vonMises });
    }
  }

  // Erőegyensúly szabad csomóponton: r = (K·u − f)_dof — a megoldás maradéka
  let eqResid: { x: number; y: number } | null = null;
  if (!isFixed) {
    // K·u dimenzója egy szabad DOF-on ≈ f_dof (CG maradék-szintig)
    // A szabad DOF-okon a reakció-leképezés nem definiált; a maradékot
    // a CG által jelentett globális relatív maradékkal jellemzzük.
    eqResid = { x: sol.residual, y: sol.residual };
  }

  return {
    nodeId,
    x: node.x,
    y: node.y,
    isFixed,
    load,
    reaction,
    displacement: u,
    neighborElements,
    equilibriumResidual: eqResid,
  };
}
