/**
 * NodePanel — nézet: csomópont-vizsgálat KaTeX-sel.
 * Rögzített csomópont: reakcióerő és egyensúly levezetése.
 * Terhelt szabad csomópont: F_int = −F_ext bemutatása.
 */

import katex from 'katex';
import 'katex/dist/katex.min.css';
import { fmt } from './mathpanel';
import type { NodeInspection } from './nodepanel';

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function disp(s: string): string {
  return katex.renderToString(esc(s), { throwOnError: false, displayMode: true });
}

export function renderNodeInspection(
  insp: NodeInspection,
  lang: 'hu' | 'en',
): string {
  const hu = lang === 'hu';
  const parts: string[] = [];

  // ————— Azonosítás + koordináta —————
  parts.push(
    '<div class="mp-section"><h3><span class="mp-icon">📍</span>' +
      (hu ? 'Csomópont adatai' : 'Node data') + '</h3>' +
      disp('n_{' + insp.nodeId + '}\\;:\\;(' + fmt.num(insp.x) + ',\\;' + fmt.num(insp.y) + ')\\,\\text{m}') +
      '<p class="mp-dim">' +
      (insp.isFixed
        ? hu ? 'Rögzített csomópont (mindkét szabadsági fok befogott).' : 'Fixed node (both DOFs restrained).'
        : insp.load
          ? hu ? 'Szabad, terhelt csomópont.' : 'Free, loaded node.'
          : hu ? 'Szabad, terheletlen csomópont.' : 'Free, unloaded node.') +
      '</p></div>',
  );

  // ————— Elmozdulás —————
  parts.push(
    '<div class="mp-section"><h3><span class="mp-icon">↔️</span>' +
      (hu ? 'Elmozdulás' : 'Displacement') + '</h3>' +
      disp('\\mathbf{u}_{n}=' +
        '\\begin{bmatrix}' + fmt.num(insp.displacement.x, 6) + '\\\\' + fmt.num(insp.displacement.y, 6) + '\\end{bmatrix}\\;\\text{m}') +
      '<ul class="mp-list">' +
      '<li>uₓ = <strong>' + fmt.m(insp.displacement.x) + '</strong></li>' +
      '<li>u_y = <strong>' + fmt.m(insp.displacement.y) + '</strong></li>' +
      '</ul></div>',
  );

  // ————— Terhelés / reakció —————
  if (insp.isFixed && insp.reaction) {
    const r = insp.reaction;
    const R = Math.hypot(r.x, r.y);
    parts.push(
      '<div class="mp-section"><h3><span class="mp-icon">⛰️</span>' +
        (hu ? 'Reakcióerő (a befogásban)' : 'Reaction force (at support)') + '</h3>' +
        disp('\\mathbf{R}=\\sum_e \\mathbf{k}_e\\,\\mathbf{u}_e-\\mathbf{f}=' +
          '\\begin{bmatrix}' + fmt.num(r.x, 2) + '\\\\' + fmt.num(r.y, 2) + '\\end{bmatrix}\\;\\text{N}') +
        '<ul class="mp-list">' +
        '<li>Rₓ = <strong>' + fmt.n(r.x) + '</strong></li>' +
        '<li>R_y = <strong>' + fmt.n(r.y) + '</strong></li>' +
        '<li>|R| = <strong>' + fmt.n(R) + '</strong></li>' +
        '</ul>' +
        '<p class="mp-dim">' +
        (hu
          ? 'A befogás annyi erőt ad vissza, amennyi a szerkezetet egyensúlyban tartja.'
          : 'The support returns exactly the force that keeps the structure in equilibrium.') +
        '</p></div>',
    );
  }

  if (insp.load) {
    const f = insp.load;
    const F = Math.hypot(f.x, f.y);
    parts.push(
      '<div class="mp-section"><h3><span class="mp-icon">🎯</span>' +
        (hu ? 'Külső terhelés' : 'External load') + '</h3>' +
        disp('\\mathbf{f}_{n}=' +
          '\\begin{bmatrix}' + fmt.num(f.x, 2) + '\\\\' + fmt.num(f.y, 2) + '\\end{bmatrix}\\;\\text{N}') +
        '<p>' + (hu ? 'Eredő:' : 'Magnitude:') + ' <strong>' + fmt.num(F, 2) + ' N</strong></p></div>',
    );
  }

  // ————— Erőegyensúly —————
  if (!insp.isFixed && insp.load) {
    const f = insp.load;
    parts.push(
      '<div class="mp-section"><h3><span class="mp-icon">⚖️</span>' +
        (hu ? 'Erőegyensúly a csomóponton' : 'Nodal force equilibrium') + '</h3>' +
        disp('\\sum \\mathbf{F}=\\mathbf{F}_{\\text{int}}+\\mathbf{f}_{n}=\\mathbf{0}\\;\\Rightarrow\\;\\mathbf{F}_{\\text{int}}=' +
          '(' + fmt.num(-f.x, 2) + ',\\;' + fmt.num(-f.y, 2) + ')\\,\\text{N}') +
        '<p class="mp-dim">' +
        (hu
          ? 'A szomszédos elemek belső erőinek eredője épp ellentéte a külső terhelésnek — ezt ellenőrzi a szolver a K·u = f rendszerben.'
          : 'The resultant of internal forces from neighbouring elements exactly opposes the external load — verified by the solver in K·u = f.') +
        '</p></div>',
    );
  }

  // ————— Környező elemek —————
  if (insp.neighborElements.length > 0) {
    const sorted = [...insp.neighborElements].sort((a, b) => b.vonMises - a.vonMises);
    const items = sorted
      .slice(0, 8)
      .map((e) => '<li>#' + e.id + ' — σ_vM = <strong>' + fmt.pa(e.vonMises) + '</strong></li>')
      .join('');
    parts.push(
      '<div class="mp-section"><h3><span class="mp-icon">🧩</span>' +
        (hu ? 'Környező elemek (' + insp.neighborElements.length + ')' : 'Neighbouring elements (' + insp.neighborElements.length + ')') + '</h3>' +
        '<ul class="mp-list">' + items + '</ul></div>',
    );
  }

  return parts.join('');
}
