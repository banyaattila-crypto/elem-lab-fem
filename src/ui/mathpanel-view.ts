/**
 * MathPanel — nézet: lépésről lépésre levezetés KaTeX-sel.
 * Minden képlet az adott elem VALÓDI számaival jelenik meg.
 * (String-konkatenáció a beágyazott template-hibák elkerülésére.)
 */

import katex from 'katex';
import 'katex/dist/katex.min.css';
import { fmt, type ElementInspection } from './mathpanel';

/**
 * A TeX-karakterláncokat NEM escape-eljük HTML-be: a `&` (mátrix-
 * oszlopelválasztó) és a `<`/`>` érvényes LaTeX-jelek, a HTML-escape
 * tönkreteszi őket („&amp;” jelent meg a képletekben). A KaTeX alapból
 * nem enged raw HTML-t a TeX-ben, így ez így biztonságos.
 */

/** Inline képlet */
function tex(s: string): string {
  return katex.renderToString(s, { throwOnError: false });
}

/** Blokk (display) képlet */
function disp(s: string): string {
  return katex.renderToString(s, { throwOnError: false, displayMode: true });
}

/** Mátrix LaTeX-ként */
function texMatrix(M: number[][], digits = 3): string {
  const rows = M.map((row) => row.map((v) => fmt.num(v, digits)).join(' & '));
  return '\\begin{bmatrix}' + rows.join(' \\\\ ') + '\\end{bmatrix}';
}

/** Szekció HTML */
function section(icon: string, title: string, body: string): string {
  return (
    '<div class="mp-section"><h3><span class="mp-icon">' + icon + '</span>' + title + '</h3>' +
    body + '</div>'
  );
}

/**
 * Teljes levezetés HTML-ként. Minden szám az `insp`-ből jön,
 * amelyet az `inspectElement()` számol az aktuális szimulációból.
 */
export function renderInspection(
  insp: ElementInspection,
  lang: 'hu' | 'en',
): string {
  const hu = lang === 'hu';
  const p1 = insp.coords[0]!;
  const p2 = insp.coords[1]!;
  const p3 = insp.coords[2]!;
  const b1 = insp.b[0]!;
  const c1 = insp.b[1]!;
  const b2 = insp.b[2]!;
  const c2 = insp.b[3]!;
  const b3 = insp.b[4]!;
  const c3 = insp.b[5]!;
  const e1 = insp.eps[0]!;
  const e2 = insp.eps[1]!;
  const e3 = insp.eps[2]!;
  const sx = insp.sigma[0]!;
  const sy = insp.sigma[1]!;
  const tx = insp.sigma[2]!;
  const u = insp.uElem;
  const t = insp.thickness;
  const nu = insp.material.nu;

  // ————— 1. Geometria —————
  const coordsTex = disp(
    '\\begin{aligned}(x_1,y_1)&=(' + fmt.num(p1.x) + ',\\;' + fmt.num(p1.y) + ')\\,\\text{m}\\\\' +
      '(x_2,y_2)&=(' + fmt.num(p2.x) + ',\\;' + fmt.num(p2.y) + ')\\,\\text{m}\\\\' +
      '(x_3,y_3)&=(' + fmt.num(p3.x) + ',\\;' + fmt.num(p3.y) + ')\\,\\text{m}\\end{aligned}',
  );
  const bcTex = disp(
    '\\begin{aligned}b_1&=' + fmt.num(b1) + ',&c_1&=' + fmt.num(c1) + '\\\\' +
      'b_2&=' + fmt.num(b2) + ',&c_2&=' + fmt.num(c2) + '\\\\' +
      'b_3&=' + fmt.num(b3) + ',&c_3&=' + fmt.num(c3) + '\\end{aligned}',
  );
  const areaTex = disp(
    'A=\\tfrac{1}{2}\\left(b_1c_2-b_2c_1\\right)=\\tfrac{1}{2}\\left[(' +
      fmt.num(b1) + ')\\cdot(' + fmt.num(c2) + ')-(' + fmt.num(b2) + ')\\cdot(' + fmt.num(c1) +
      ')\\right]=\\mathbf{' + fmt.area(insp.area) + '}',
  );
  const geom = section(
    '📐',
    hu ? '1. Geometria — csúszóint-koordináták' : '1. Geometry — areal coordinates',
    '<p>' + (hu ? 'A három csomópont koordinátái (világrendszer):' : 'The three node coordinates (world system):') + '</p>' +
      coordsTex +
      '<p>' + (hu ? 'Csúszóint-koordináták és a terület:' : 'Areal coordinates and the area:') + '</p>' +
      bcTex + areaTex,
  );

  // ————— 2. Anyag + D mátrix —————
  const k = insp.material.E / (1 - nu * nu);
  const dNum = [
    [k, k * nu, 0],
    [k * nu, k, 0],
    [0, 0, (k * (1 - nu)) / 2],
  ];
  const dTex = disp(
    '\\mathbf{D}=\\frac{E}{1-\\nu^2}\\begin{bmatrix}1&\\nu&0\\\\\\nu&1&0\\\\0&0&\\tfrac{1-\\nu}{2}\\end{bmatrix}=' +
      texMatrix(dNum, 3),
  );
  const mat = section(
    '🧪',
    (hu ? '2. Anyag: ' : '2. Material: ') + insp.material.name,
    '<p>E = ' + fmt.pa(insp.material.E) + ', ν = ' + nu + ', t = ' + fmt.m(t) +
      (hu ? ' — síkfeszültség-állapot.' : ' — plane stress.') + '</p>' +
      dTex +
      '<p class="mp-dim">' + (hu ? 'Összefüggés: σ = D·ε' : 'Relation: σ = D·ε') + '</p>',
  );

  // ————— 3. B mátrix —————
  const b2a = insp.B.map((row) => row.map((v) => v * 2 * insp.area));
  const bDefTex = disp(
    '\\mathbf{B}=\\frac{1}{2A}\\begin{bmatrix}' +
      fmt.num(b1, 3) + '&0&' + fmt.num(b2, 3) + '&0&' + fmt.num(b3, 3) + '&0\\\\' +
      '0&' + fmt.num(c1, 3) + '&0&' + fmt.num(c2, 3) + '&0&' + fmt.num(c3, 3) + '\\\\' +
      fmt.num(c1, 3) + '&' + fmt.num(b1, 3) + '&' + fmt.num(c2, 3) + '&' + fmt.num(b2, 3) + '&' + fmt.num(c3, 3) + '&' + fmt.num(b3, 3) +
      '\\end{bmatrix}=' + texMatrix(insp.B, 2),
  );
  const bCheckTex = disp('2A\\,\\mathbf{B}=' + texMatrix(b2a, 2));
  const bmat = section(
    '🧮',
    hu ? '3. B mátrix — alakváltozás-elmozdulás' : '3. B matrix — strain-displacement',
    bDefTex +
      '<p class="mp-dim">' + (hu ? 'Ellenőrzés — a 2A·B szorzat:' : 'Check — the product 2A·B:') + '</p>' +
      bCheckTex,
  );

  // ————— 4. Elemi merevség —————
  const keNorm = insp.ke.map((row) => row.map((v) => v / (t * insp.area)));
  const keDefTex = disp(
    '\\mathbf{k}_e=t\\,A\\,\\mathbf{B}^{\\top}\\mathbf{D}\\,\\mathbf{B}=(' +
      fmt.num(t, 3) + '\\,\\text{m})\\cdot(' + fmt.area(insp.area) + ')\\cdot[\\ldots]',
  );
  const keValTex = disp('\\mathbf{k}_e/(tA)=' + texMatrix(keNorm, 3));
  const keSec = section(
    '⚙️',
    hu ? '4. Elemi merevségi mátrix (6×6)' : '4. Element stiffness matrix (6×6)',
    keDefTex + keValTex +
      '<p class="mp-dim">' +
      (hu
        ? 'Szimmetrikus, pozitív szemidefinit — merevtest-mozgásra nulla.'
        : 'Symmetric, positive semi-definite — zero for rigid-body modes.') +
      '</p>',
  );

  // ————— 5. Elmozdulások —————
  const uTex = disp('\\mathbf{u}_e=' + texMatrix([u], 6) + '\\;\\text{m}');
  const disp5 = section(
    '↔️',
    hu ? '5. Csomóponti elmozdulások' : '5. Nodal displacements',
    uTex +
      '<p class="mp-dim">' +
      (hu
        ? 'A K·u = f rendszerből — DOF-elimináció + Conjugate Gradient.'
        : 'From K·u = f — DOF elimination + Conjugate Gradient.') +
      '</p>',
  );

  // ————— 6. Alakváltozás —————
  const epsTex = disp(
    '\\boldsymbol{\\varepsilon}=\\mathbf{B}\\,\\mathbf{u}_e=' +
      texMatrix([[e1], [e2], [e3]], 6) + '\\;\\text{[–]}',
  );
  const eps6 = section(
    '📏',
    hu ? '6. Alakváltozás: ε = B·uₑ' : '6. Strain: ε = B·uₑ',
    epsTex +
      '<ul class="mp-list">' +
      '<li>εₓ = <strong>' + fmt.num(e1, 6) + '</strong></li>' +
      '<li>ε_y = <strong>' + fmt.num(e2, 6) + '</strong></li>' +
      '<li>γₓᵧ = <strong>' + fmt.num(e3, 6) + '</strong></li>' +
      '</ul>',
  );

  // ————— 7. Feszültség —————
  const sigTex = disp(
    '\\boldsymbol{\\sigma}=\\mathbf{D}\\,\\boldsymbol{\\varepsilon}=' +
      texMatrix([[sx], [sy], [tx]], 3) + '\\;\\text{Pa}',
  );
  const sig7 = section(
    '💥',
    hu ? '7. Feszültség: σ = D·ε' : '7. Stress: σ = D·ε',
    sigTex +
      '<ul class="mp-list">' +
      '<li>σₓ = <strong>' + fmt.pa(sx) + '</strong></li>' +
      '<li>σ_y = <strong>' + fmt.pa(sy) + '</strong></li>' +
      '<li>τₓᵧ = <strong>' + fmt.pa(tx) + '</strong></li>' +
      '</ul>',
  );

  // ————— 8. Von Mises —————
  const vmTex = disp(
    '\\sigma_{\\text{vM}}=\\sqrt{\\sigma_x^2+\\sigma_y^2-\\sigma_x\\sigma_y+3\\tau_{xy}^2}' +
      '=\\sqrt{(' + fmt.num(sx, 3) + ')^2+(' + fmt.num(sy, 3) + ')^2-(' + fmt.num(sx, 3) + ')(' + fmt.num(sy, 3) + ')+3(' + fmt.num(tx, 3) + ')^2}' +
      '=\\mathbf{' + fmt.pa(insp.vonMises) + '}',
  );
  const vm8 = section(
    '🎯',
    hu ? '8. Von Mises összehasonlító feszültség' : '8. Von Mises equivalent stress',
    vmTex +
      '<p class="mp-dim">' +
      (hu
        ? 'Ez az érték színezi az elemet a hőtérképen.'
        : 'This value colors the element in the heatmap.') +
      '</p>',
  );

  return geom + mat + bmat + keSec + disp5 + eps6 + sig7 + vm8;
}

/** Kis segéd az inline képletekhez (későbbi bővítéshez) */
export { tex };
