/**
 * MathPanel — nézet: lépésről lépésre levezetés KaTeX-sel.
 * Minden képlet az adott elem VALÓDI számaival jelenik meg.
 * (String-konkatenáció a beágyazott template-hibák elkerülésére.)
 *
 * Az elemtípustól (CST / T6) függően ugyanaz a 8 szekció jelenik meg, de a
 * T6-nál a kvadratikus elemre jellemző képletekkel: természetes koordináták,
 * Gauss-pontok, súlyozott B-átlag és 12×12 merevség.
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
  const t6 = insp.elementType === 'T6';
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
  const isT6Mesh = t6;

  /** (a, b) → helyi vagy angol szöveg */
  const L = (h: string, e: string): string => (hu ? h : e);

  // ————— 1. Geometria —————
  const coordsTex = disp(
    '\\begin{aligned}' +
      insp.coords
        .map(
          (p, i) =>
            '(x_{' +
            (i + 1) +
            '},y_{' +
            (i + 1) +
            '})&=(' +
            fmt.num(p.x) +
            ',\\;' +
            fmt.num(p.y) +
            ')\\,\\text{m}',
        )
        .join('\\\\') +
      '\\end{aligned}',
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

  // T6: természetes koordináták + a Gauss-pontok determinánsai
  const naturalTex = insp.natural
    ? disp(
        '\\begin{array}{c|ccc}i&L_1&L_2&L_3\\\\\\hline' +
          insp.natural
            .map(
              (q, i) =>
                (i + 1) +
                '&' +
                fmt.num(q.l1, 2) +
                '&' +
                fmt.num(q.l2, 2) +
                '&' +
                fmt.num(q.l3, 2),
            )
            .join('\\\\') +
          '\\end{array}',
      )
    : '';
  const gaussTable = insp.gauss
    ? '<table class="mp-table"><thead><tr><th>' +
      L('Gauss-pont', 'Gauss point') +
      '</th><th>(L₁, L₂)</th><th>w</th><th>det J</th></tr></thead><tbody>' +
      insp.gauss
        .map(
          (g, i) =>
            '<tr><td>' +
            (i + 1) +
            '</td><td>(' +
            fmt.num(g.l1, 2) +
            ', ' +
            fmt.num(g.l2, 2) +
            ')</td><td>' +
            fmt.num(g.w, 3) +
            '</td><td>' +
            fmt.num(g.detJ, 6) +
            '</td></tr>',
        )
        .join('') +
      '</tbody></table>'
    : '';

  const geom = section(
    '📐',
    isT6Mesh
      ? L('1. Geometria — 6 csúcs és természetes koordináták', '1. Geometry — 6 nodes and natural coordinates')
      : L('1. Geometria — csúszóint-koordináták', '1. Geometry — areal coordinates'),
    '<p>' +
      (isT6Mesh
        ? L(
            'A hat csúcs koordinátái (világrendszer) — 3 sarok + 3 élközépcsúcs:',
            'The six node coordinates (world system) — 3 corners + 3 edge mid-nodes:',
          )
        : L('A három csomópont koordinátái (világrendszer):', 'The three node coordinates (world system):')) +
      '</p>' +
      coordsTex +
      (isT6Mesh
        ? '<p>' +
          L(
            'A természetes (területi) koordináták, amelyeken az alakfüggvények definiáltak (L₁+L₂+L₃=1):',
            'Natural (areal) coordinates, on which the shape functions are defined (L₁+L₂+L₃=1):',
          ) +
          '</p>' +
          naturalTex +
          '<p>' +
          L(
            'A sarok-háromszög csúszóint-koordinátái (geometriai referencia):',
            'Areal coordinates of the corner triangle (geometric reference):',
          ) +
          '</p>' +
          bcTex +
          areaTex +
          '<p>' +
          L(
            'A 3 pontos Gauss-kvadratúra: az élek középpontjaiban. A B mátrix lineáris L-ben, így BᵀDB kvadratikus — ez a szabály egzakt.',
            '3-point Gauss quadrature: at the edge midpoints. B is linear in L, so BᵀDB is quadratic — this rule is exact.',
          ) +
          '</p>' +
          gaussTable
        : '<p>' +
          L('Csúszóint-koordináták és a terület:', 'Areal coordinates and the area:') +
          '</p>' +
          bcTex +
          areaTex),
  );

  // ————— 2. Anyag + D mátrix —————
  const kMat = insp.material.E / (1 - nu * nu);
  const dNum = [
    [kMat, kMat * nu, 0],
    [kMat * nu, kMat, 0],
    [0, 0, (kMat * (1 - nu)) / 2],
  ];
  const dTex = disp(
    '\\mathbf{D}=\\frac{E}{1-\\nu^2}\\begin{bmatrix}1&\\nu&0\\\\\nu&1&0\\\\0&0&\\tfrac{1-\\nu}{2}\\end{bmatrix}=' +
      texMatrix(dNum, 3),
  );
  const mat = section(
    '🧪',
    L('2. Anyag: ', '2. Material: ') + insp.material.name,
    '<p>E = ' + fmt.pa(insp.material.E) + ', ν = ' + nu + ', t = ' + fmt.m(t) +
      L(' — síkfeszültség-állapot.', ' — plane stress.') + '</p>' +
      dTex +
      '<p class="mp-dim">' + L('Összefüggés: σ = D·ε', 'Relation: σ = D·ε') + '</p>',
  );

  // ————— 3. B mátrix —————
  const bmat = isT6Mesh
    ? section(
        '🧮',
        L('3. B mátrix — Gauss-átlag (3×12)', '3. B matrix — Gauss average (3×12)'),
        disp(
          '\\overline{\\mathbf{B}}=\\frac{\\sum_g w_g\\,\\det\\mathbf{J}_g\\,\\mathbf{B}_g}{\\sum_g w_g\\,\\det\\mathbf{J}_g}=[\\ldots]',
        ) +
          texMatrix(insp.B, 2) +
          '<p class="mp-dim">' +
          L(
            'A kvadratikus elemen a B nem állandó — minden Gauss-pontban más. A fenti súlyozott átlag az, amellyel az ε = B·uₑ azonosság pontosan teljesül (az alakváltozás lineáris uₑ-ben).',
            'On the quadratic element B is not constant — it differs at every Gauss point. The weighted average shown is the one for which ε = B·uₑ holds exactly (strain is linear in uₑ).',
          ) +
          '</p>',
      )
    : (() => {
        const b2a = insp.B.map((row) => row.map((v) => v * 2 * insp.area));
        const bDefTex = disp(
          '\\mathbf{B}=\\frac{1}{2A}\\begin{bmatrix}' +
            fmt.num(b1, 3) + '&0&' + fmt.num(b2, 3) + '&0&' + fmt.num(b3, 3) + '&0\\\\' +
            '0&' + fmt.num(c1, 3) + '&0&' + fmt.num(c2, 3) + '&0&' + fmt.num(c3, 3) + '\\\\' +
            fmt.num(c1, 3) + '&' + fmt.num(b1, 3) + '&' + fmt.num(c2, 3) + '&' + fmt.num(b2, 3) +
            '&' + fmt.num(c3, 3) + '&' + fmt.num(b3, 3) +
            '\\end{bmatrix}=' + texMatrix(insp.B, 2),
        );
        const bCheckTex = disp('2A\\,\\mathbf{B}=' + texMatrix(b2a, 2));
        return section(
          '🧮',
          L('3. B mátrix — alakváltozás-elmozdulás', '3. B matrix — strain-displacement'),
          bDefTex +
            '<p class="mp-dim">' +
            L('Ellenőrzés — a 2A·B szorzat:', 'Check — the product 2A·B:') +
            '</p>' +
            bCheckTex,
        );
      })();

  // ————— 4. Elemi merevség —————
  const keNorm = insp.ke.map((row) => row.map((v) => v / (t * insp.area)));
  const keValTex = disp('\\mathbf{k}_e/(tA)=' + texMatrix(keNorm, 3));
  const keSec = isT6Mesh
    ? section(
        '⚙️',
        L('4. Elemi merevségi mátrix (12×12)', '4. Element stiffness matrix (12×12)'),
        disp(
          '\\mathbf{k}_e=t\\sum_{g=1}^{3} w_g\\,\\det\\mathbf{J}_g\\;\\mathbf{B}_g^{\\top}\\mathbf{D}\\,\\mathbf{B}_g=(' +
            fmt.num(t, 3) +
            '\\,\\text{m})\\cdot\\sum_{g=1}^{3}[\\ldots]',
        ) +
          keValTex +
          '<p class="mp-dim">' +
          L(
            'Szimmetrikus, pozitív szemidefinit — a 6 merevtest-mozgásra nulla. A mátrix vízszintesen görgethető.',
            'Symmetric, positive semi-definite — zero for the 6 rigid-body modes. Scroll horizontally.',
          ) +
          '</p>',
      )
    : section(
        '⚙️',
        L('4. Elemi merevségi mátrix (6×6)', '4. Element stiffness matrix (6×6)'),
        disp(
          '\\mathbf{k}_e=t\\,A\\,\\mathbf{B}^{\\top}\\mathbf{D}\\,\\mathbf{B}=(' +
            fmt.num(t, 3) +
            '\\,\\text{m})\\cdot(' +
            fmt.area(insp.area) +
            ')\\cdot[\\ldots]',
        ) +
          keValTex +
          '<p class="mp-dim">' +
          L(
            'Szimmetrikus, pozitív szemidefinit — merevtest-mozgásra nulla.',
            'Symmetric, positive semi-definite — zero for rigid-body modes.',
          ) +
          '</p>',
      );

  // ————— 5. Elmozdulások —————
  const uTex = disp('\\mathbf{u}_e=' + texMatrix([u], 6) + '\\;\\text{m}');
  const dispSec = section(
    '↔️',
    isT6Mesh
      ? L('5. Csomóponti elmozdulások (6 csúcs)', '5. Nodal displacements (6 nodes)')
      : L('5. Csomóponti elmozdulások', '5. Nodal displacements'),
    uTex +
      '<p class="mp-dim">' +
      L(
        'A K·u = f rendszerből — DOF-elimináció + Conjugate Gradient.',
        'From K·u = f — DOF elimination + Conjugate Gradient.',
      ) +
      '</p>',
  );

  // ————— 6. Alakváltozás —————
  const epsTex = disp(
    '\\boldsymbol{\\varepsilon}=\\mathbf{B}\\,\\mathbf{u}_e=' +
      texMatrix([[e1], [e2], [e3]], 6) + '\\;\\text{[–]}',
  );
  const epsSec = section(
    '📏',
    L('6. Alakváltozás: ε = B·uₑ', '6. Strain: ε = B·uₑ'),
    epsTex +
      '<ul class="mp-list">' +
      '<li>εₓ = <strong>' + fmt.num(e1, 6) + '</strong></li>' +
      '<li>ε_y = <strong>' + fmt.num(e2, 6) + '</strong></li>' +
      '<li>γₓᵧ = <strong>' + fmt.num(e3, 6) + '</strong></li>' +
      '</ul>' +
      (isT6Mesh
        ? '<p class="mp-dim">' +
          L(
            'Gauss-pontok súlyozott átlaga — az elemen belül az alakváltozás lineárisan változik.',
            'Weighted average of the Gauss points — strain varies linearly inside the element.',
          ) +
          '</p>'
        : ''),
  );

  // ————— 7. Feszültség —————
  const sigTex = disp(
    '\\boldsymbol{\\sigma}=\\mathbf{D}\\,\\boldsymbol{\\varepsilon}=' +
      texMatrix([[sx], [sy], [tx]], 3) + '\\;\\text{Pa}',
  );
  const sigSec = section(
    '💥',
    L('7. Feszültség: σ = D·ε', '7. Stress: σ = D·ε'),
    sigTex +
      '<ul class="mp-list">' +
      '<li>σₓ = <strong>' + fmt.pa(sx) + '</strong></li>' +
      '<li>σ_y = <strong>' + fmt.pa(sy) + '</strong></li>' +
      '<li>τₓᵧ = <strong>' + fmt.pa(tx) + '</strong></li>' +
      '</ul>' +
      (isT6Mesh
        ? '<p class="mp-dim">' +
          L(
            'Gauss-pontok súlyozott átlaga — a hőtérkép elemenként egy értéket kér.',
            'Weighted average of the Gauss points — the heatmap needs one value per element.',
          ) +
          '</p>'
        : ''),
  );

  // ————— 8. Von Mises —————
  const vmTex = disp(
    '\\sigma_{\\text{vM}}=\\sqrt{\\sigma_x^2+\\sigma_y^2-\\sigma_x\\sigma_y+3\\tau_{xy}^2}' +
      '=\\sqrt{(' + fmt.num(sx, 3) + ')^2+(' + fmt.num(sy, 3) + ')^2-(' + fmt.num(sx, 3) + ')(' + fmt.num(sy, 3) + ')+3(' + fmt.num(tx, 3) + ')^2}' +
      '=\\mathbf{' + fmt.pa(insp.vonMises) + '}',
  );
  const vmSec = section(
    '🎯',
    L('8. Von Mises összehasonlító feszültség', '8. Von Mises equivalent stress'),
    vmTex +
      '<p class="mp-dim">' +
      L('Ez az érték színezi az elemet a hőtérképen.', 'This value colors the element in the heatmap.') +
      '</p>',
  );

  return geom + mat + bmat + keSec + dispSec + epsSec + sigSec + vmSec;
}

/** Kis segéd az inline képletekhez (későbbi bővítéshez) */
export { tex };
