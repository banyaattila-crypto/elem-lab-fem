/**
 * ElemLab — fő belépési pont.
 * UI elrendezés, modellkezelés, szimuláció és renderelés összekötése.
 */

import './style.css';
import { buildCantilever } from './models/cantilever';
import { buildTrussBridge } from './models/trussBridge';
import { buildPlateWithHole } from './models/plateWithHole';
import { buildSimplySupported } from './models/simplySupported';
import { buildPortalFrame } from './models/portalFrame';
import { buildFixedFixed } from './models/fixedFixed';
import { buildCorbel } from './models/corbel';
import { convertToT6 } from './models/t6convert';
import { solve } from './fem/solve';
import { Renderer } from './viz/renderer';
import { WebGLRenderer } from './viz/webgl-renderer';
import { inspectElement } from './ui/mathpanel';
import { renderInspection } from './ui/mathpanel-view';
import { inspectNode } from './ui/nodepanel';
import { renderNodeInspection } from './ui/nodepanel-view';
import { findElementAt, findNodeAt, screenToWorld } from './viz/picking';
import { stressGradientCss } from './viz/colormap';
import { MVPanel } from './viz/diagrams';
import { ControlsPanel, type ModelOption } from './ui/controls';
import { APP_VERSION, BUILD_ID } from './version';
import { lessonFor } from './ui/lessons';
import { setLang, type Lang } from './ui/i18n';
import type { Theme } from './viz/theme';
import type { Mesh, SolutionResult } from './fem/types';
import type { MaterialKey } from './models/meshgen';

const MODEL_OPTIONS: ModelOption[] = [
  { id: 'cantilever', label: 'Konzolgerenda' },
  { id: 'simplySupported', label: 'Egyszerűen tartott gerenda' },
  { id: 'fixedFixed', label: 'Kétvégén befogott gerenda' },
  { id: 'portalFrame', label: 'Portálkeret' },
  { id: 'corbel', label: 'Konzolos tartó' },
  { id: 'trussBridge', label: 'Rácsos híd' },
  { id: 'plateWithHole', label: 'Lyukas lemez' },
];

const MODEL_LABELS: Record<string, Record<Lang, string>> = {
  cantilever: { hu: 'Konzolgerenda', en: 'Cantilever beam' },
  simplySupported: { hu: 'Egyszerűen tartott gerenda', en: 'Simply supported beam' },
  fixedFixed: { hu: 'Kétvégén befogott gerenda', en: 'Fixed–fixed beam' },
  portalFrame: { hu: 'Portálkeret', en: 'Portal frame' },
  corbel: { hu: 'Konzolos tartó', en: 'Corbel bracket' },
  trussBridge: { hu: 'Rácsos híd', en: 'Truss bridge' },
  plateWithHole: { hu: 'Lyukas lemez', en: 'Plate with hole' },
};

type ParamKey = 'load' | 'density' | 'material' | 'defscale';

const state = {
  modelId: 'cantilever',
  load: 1000,
  density: 3,
  material: 'steel' as MaterialKey,
  defscale: 500,
  selectedElem: null as number | null,
  selectedNode: null as number | null,
  animating: false,
  phase: 1,
  engine: 'canvas' as 'canvas' | 'webgl',
  elementType: 'CST' as 'CST' | 'T6',
  /** Terhelés-típus: pontterhelés vagy elosztott (csak gerenda-modelleknél) */
  loadType: 'point' as 'point' | 'distributed',
};

let rafId: number | null = null;

/** Az utolsó megoldás — kattintáskor újraszámolás nélkül újrarajzolunk */
let lastMesh: Mesh | null = null;
let lastSol: SolutionResult | null = null;

// ————— UI váz —————

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <div class="aurora" aria-hidden="true"><i class="ab ab-1"></i><i class="ab ab-2"></i><i class="ab ab-3"></i></div>
  <header class="topbar">
    <div class="brand">
      <svg class="brand-mark" viewBox="0 0 48 48" aria-hidden="true">
        <defs>
          <linearGradient id="bm-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#2f6be6"/>
            <stop offset="0.55" stop-color="#7c3aed"/>
            <stop offset="1" stop-color="#c026d3"/>
          </linearGradient>
          <radialGradient id="bm-glow" cx="50%" cy="40%" r="60%">
            <stop offset="0" stop-color="#ffffff" stop-opacity="0.3"/>
            <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
          </radialGradient>
        </defs>
        <rect x="1" y="1" width="46" height="46" rx="14" fill="url(#bm-grad)"/>
        <rect x="1" y="1" width="46" height="46" rx="14" fill="url(#bm-glow)"/>
        <g fill="none" stroke="#ffffff" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.9">
          <path d="M12 14 L23 22 L12 29 M23 22 L30 11 M23 22 L36 26 M23 22 L24 34" opacity="0.92"/>
          <path d="M12 14 L30 11 L36 26 L24 34 L12 29 Z" opacity="0.6"/>
        </g>
        <circle cx="12" cy="14" r="1.6" fill="#ffffff"/>
        <circle cx="30" cy="11" r="1.6" fill="#ffffff"/>
        <circle cx="36" cy="26" r="1.6" fill="#ffffff"/>
        <circle cx="24" cy="34" r="1.6" fill="#ffffff"/>
        <circle cx="12" cy="29" r="1.6" fill="#ffffff"/>
        <circle cx="23" cy="22" r="3" fill="#ffffff"/>
        <circle cx="23" cy="22" r="6" fill="none" stroke="#ffffff" opacity="0.45"/>
        <circle class="bm-ring" cx="23" cy="22" r="7.5" fill="none" stroke="#ffffff" stroke-width="1.4"/>
      </svg>
      <div class="brand-text">
        <h1>ElemLab</h1>
        <p class="subtitle" id="subtitle">Végeselem-módszer játszótér</p>
      </div>
    </div>
    <span class="topbar-badge" id="topver"></span>
    <button id="theme-toggle" class="theme-toggle" aria-pressed="false"></button>
  </header>
  <div class="layout">
    <aside class="sidebar" id="controls-root"></aside>
    <main class="stage">
      <div class="canvas-wrap">
        <canvas id="canvas"></canvas>
        <div class="mesh-stats" id="mesh-stats" aria-hidden="true"></div>
        <div class="legend" id="legend">
          <span id="legend-lo">0</span>
          <div class="legend-bar" id="legend-bar"></div>
          <span id="legend-hi">max</span>
          <span class="legend-sep"></span>
          <span class="legend-def" id="legend-def">×500</span>
        </div>
        <button id="anim-btn" class="anim-btn" aria-pressed="false">▶ Animáció indítása</button>
        <div class="engine-switch">
          <button id="engine-canvas" class="active" title="Canvas 2D — gyors, 2D">2D</button>
          <button id="engine-webgl" title="WebGL — folytonos szín, forgatás">3D</button>
          <button id="elem-t6" title="Elem-típus: lineáris CST ⇄ kvadratikus T6">CST</button>
        </div>
      </div>
      <div class="mv-panel" id="mv-panel">
        <div class="mv-header">
          <button id="mv-toggle" class="mv-toggle" aria-pressed="false">M/V diagram ▼</button>
        </div>
        <canvas id="mv-canvas"></canvas>
      </div>
      <nav class="tabs" id="tabs" role="tablist" aria-label="Részletek">
        <span class="tab-indicator" aria-hidden="true"></span>
        <button class="tab active" data-tab="lesson" role="tab" aria-selected="true">Lecke</button>
        <button class="tab" data-tab="results" role="tab" aria-selected="false">Eredmények</button>
        <button class="tab" data-tab="inspect" role="tab" aria-selected="false">Vizsgálat</button>
      </nav>
      <div class="tab-page" id="page-lesson">
        <section class="lesson-card" id="lesson-card"></section>
      </div>
      <div class="tab-page" id="page-results">
        <section class="results" id="results"></section>
      </div>
      <div class="tab-page" id="page-inspect">
        <section class="mathpanel" id="mathpanel"></section>
        <section class="mathpanel nodepanel" id="nodepanel"></section>
      </div>
    </main>
  </div>
  <footer>
    <p>ElemLab — végeselem-módszer, oktatási célú bemutató. Saját felelősségre!
      <span class="verinfo" id="verinfo"></span></p>
  </footer>
`;

const canvas = document.querySelector<HTMLCanvasElement>('#canvas')!;
const mvCanvas = document.querySelector<HTMLCanvasElement>('#mv-canvas')!;
const mvPanel = new MVPanel(mvCanvas);
const renderer = new Renderer(canvas);
// WebGL Opcionális: ha nem elérhető (régi VM, kikapcs. hw-gyorsítás,
// blokkolt GPU), a teljes app ne dőljön el — csak a 3D gomb tiltva.
let webglRenderer: WebGLRenderer | null = null;
let webglError: string | null = null;
try {
  webglRenderer = new WebGLRenderer(canvas);
} catch (err) {
  webglError = err instanceof Error ? err.message : String(err);
  console.error('[ElemLab] WebGL nem elérhető — a 3D nézet tiltva:', webglError);
}

// ————— Elemkiválasztás + matematikai panel —————

canvas.addEventListener('click', (ev) => {
  if (panMoved) return; // húzás volt, nem kattintás → nincs kiválasztás
  const view = renderer.lastView;
  if (!view || !lastMesh) return;
  const rect = canvas.getBoundingClientRect();
  const world = screenToWorld(ev.clientX - rect.left, ev.clientY - rect.top, view);
  // Kattintás-ergonómia: csomópont elsőbbség az elemekkel szemben.
  // Tolerancia = a legkisebb elemméret 30%-a, minimum a háló jellemző méretének töredéke.
  const tol = estimateTolerance(lastMesh);
  state.selectedNode = findNodeAt(lastMesh, world.x, world.y, tol);
  state.selectedElem =
    state.selectedNode == null ? findElementAt(lastMesh, world.x, world.y) : null;
  if (state.selectedNode != null || state.selectedElem != null) setTab('inspect');
  updateMathPanel();
  updateNodePanel();
  redraw();
});

// ————— Zoom / pan (Canvas 2D) —————
// Görgő: zoom a mutató körül; húzás: mozgatás; dupla kattintás: nézet visszaállítása.
canvas.addEventListener('wheel', (ev) => {
  if (state.engine !== 'canvas') return;
  ev.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const factor = Math.exp(-ev.deltaY * 0.0015);
  renderer.zoomAt(ev.clientX - rect.left, ev.clientY - rect.top, factor);
  redraw();
}, { passive: false });

let panning = false;
let panStartX = 0;
let panStartY = 0;
let panMoved = false;
canvas.addEventListener('pointerdown', (ev) => {
  if (state.engine !== 'canvas' || ev.button !== 0) return;
  panning = true;
  panMoved = false;
  panStartX = ev.clientX;
  panStartY = ev.clientY;
});
window.addEventListener('pointermove', (ev) => {
  if (!panning) return;
  const dsx = ev.clientX - panStartX;
  const dsy = ev.clientY - panStartY;
  panStartX = ev.clientX;
  panStartY = ev.clientY;
  if (Math.abs(dsx) + Math.abs(dsy) > 3) panMoved = true;
  renderer.panBy(dsx, dsy);
  redraw();
});
window.addEventListener('pointerup', () => {
  panning = false;
});
canvas.addEventListener('dblclick', () => {
  if (state.engine !== 'canvas') return;
  renderer.resetView();
  redraw();
});

/** A kattintás toleranciája: jellemző elemméret 35%-a */
function estimateTolerance(mesh: Mesh): number {
  if (mesh.elements.length === 0) return 0.05;
  const e0 = mesh.elements[0]!;
  const p1 = mesh.nodes[e0.nodes[0]!]!;
  const p2 = mesh.nodes[e0.nodes[1]!]!;
  const p3 = mesh.nodes[e0.nodes[2]!]!;
  const size = Math.max(
    Math.hypot(p2.x - p1.x, p2.y - p1.y),
    Math.hypot(p3.x - p2.x, p3.y - p2.y),
  );
  return Math.max(size * 0.35, 1e-6);
}

/** Gerenda-modellek, ahol M/V diagram is mutatható */
const BEAM_MODELS = new Set(['cantilever', 'simplySupported', 'fixedFixed']);

function redraw(): void {
  if (!lastMesh || !lastSol) return;
  const common = {
    deformationScale: state.defscale,
    stressMax: lastSol.maxVonMises || 1,
    showMeshEdges: true,
    highlight: state.selectedElem,
    highlightNode: state.selectedNode,
    phase: state.phase,
  };
  // M/V panel: gerenda-modelleknél adatok, egyébként üres
  if (state.engine === 'canvas' && BEAM_MODELS.has(state.modelId)) {
    mvPanel.setData(lastMesh, lastSol);
  } else {
    mvPanel.clear();
  }
  if (state.engine === 'webgl') {
    if (webglRenderer) {
      webglRenderer.render(lastMesh, lastSol, common);
    } else {
      // WebGL nem elérhető → visszaváltás 2D-re
      state.engine = 'canvas';
      setEngineButtons();
      renderer.render(lastMesh, lastSol, common);
    }
  } else {
    renderer.render(lastMesh, lastSol, common);
  }
}

// ————— Részletek-fülek (Lecke / Eredmények / Vizsgálat) —————

type TabName = 'lesson' | 'results' | 'inspect';

function setTab(name: TabName): void {
  document.querySelectorAll<HTMLButtonElement>('.tab').forEach((b) => {
    const active = b.dataset.tab === name;
    b.classList.toggle('active', active);
    b.setAttribute('aria-selected', String(active));
  });
  (['lesson', 'results', 'inspect'] as const).forEach((id) => {
    const page = document.getElementById(`page-${id}`)!;
    page.classList.toggle('active', id === name);
  });
  placeTabIndicator();
}

/** A csúszó füljelzőt az aktív fülre igazítja */
function placeTabIndicator(): void {
  const tabs = document.querySelector<HTMLElement>('#tabs');
  const ind = tabs?.querySelector<HTMLElement>('.tab-indicator');
  const active = tabs?.querySelector<HTMLButtonElement>('.tab.active');
  if (!tabs || !ind || !active) return;
  ind.style.width = `${active.offsetWidth}px`;
  ind.style.transform = `translateX(${active.offsetLeft}px)`;
}

function initTabs(): void {
  document.querySelectorAll<HTMLButtonElement>('.tab').forEach((b) => {
    b.addEventListener('click', () => setTab(b.dataset.tab as TabName));
  });
}

// ————— Deformáció-animáció —————

function animateFrame(ts: number): void {
  // 1.6 s teljes ciklus: 0→1→0 (sin² lengetés, gyengéd kiindulás/érkezés)
  const t = (ts % 1600) / 1600;
  state.phase = Math.sin(t * Math.PI) ** 2;
  redraw();
  rafId = requestAnimationFrame(animateFrame);
}

function toggleAnimation(): void {
  state.animating = !state.animating;
  const btn = document.querySelector<HTMLButtonElement>('#anim-btn')!;
  const hu = getLang() === 'hu';
  if (state.animating) {
    btn.textContent = hu ? '⏸ Animáció leállítása' : '⏸ Stop animation';
    btn.setAttribute('aria-pressed', 'true');
    rafId = requestAnimationFrame(animateFrame);
  } else {
    btn.textContent = hu ? '▶ Animáció indítása' : '▶ Animate deformation';
    btn.setAttribute('aria-pressed', 'false');
    if (rafId != null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    state.phase = 1;
    redraw();
  }
}

function updateMathPanel(): void {
  const el = document.querySelector<HTMLDivElement>('#mathpanel')!;
  const hu = getLang() === 'hu';
  if (state.selectedElem == null || !lastMesh || !lastSol) {
    el.innerHTML = `<div class="mp-empty">${hu ? '👆 Kattints egy elemre a canvason — a teljes matematikai levezetés élő adatokkal jelenik meg.' : '👆 Click an element on the canvas — the full derivation appears with live data.'}</div>`;
    return;
  }
  try {
    const insp = inspectElement(lastMesh, lastSol, state.selectedElem);
    const n = lastMesh.elements.length;
    el.innerHTML = `
      <div class="mp-header">
        <h2>${hu ? 'Elemvizsgálat' : 'Element inspection'} #${insp.elemId} <span class="mp-tag">${insp.elementType}</span></h2>
        <div class="mp-nav">
          <button id="mp-prev" title="${hu ? 'Előző elem' : 'Previous element'}">◀</button>
          <span class="mp-count">${insp.elemId + 1} / ${n}</span>
          <button id="mp-next" title="${hu ? 'Következő elem' : 'Next element'}">▶</button>
          <button id="mp-close" title="${hu ? 'Bezárás' : 'Close'}">✕</button>
        </div>
      </div>
      ${renderInspection(insp, getLang())}
    `;
    document.querySelector<HTMLButtonElement>('#mp-prev')!.addEventListener('click', () => {
      state.selectedElem = ((state.selectedElem ?? 0) - 1 + n) % n;
      updateMathPanel();
      redraw();
    });
    document.querySelector<HTMLButtonElement>('#mp-next')!.addEventListener('click', () => {
      state.selectedElem = ((state.selectedElem ?? 0) + 1) % n;
      updateMathPanel();
      redraw();
    });
    document.querySelector<HTMLButtonElement>('#mp-close')!.addEventListener('click', () => {
      state.selectedElem = null;
      updateMathPanel();
      redraw();
    });
  } catch {
    state.selectedElem = null;
    el.innerHTML = `<div class="mp-empty">${hu ? 'Válassz elemet!' : 'Select an element!'}</div>`;
  }
}

function resizeCanvas(): void {
  const wrap = canvas.parentElement!;
  canvas.width = wrap.clientWidth;
  canvas.height = Math.max(400, Math.min(640, wrap.clientWidth * 0.7));
  webglRenderer?.setSize(canvas.width, canvas.height);
}
window.addEventListener('resize', () => {
  resizeCanvas();
  rebuildAndSolve();
  placeTabIndicator();
});

function toggleMVPanel(): void {
  const panel = document.querySelector<HTMLDivElement>('#mv-panel')!;
  const btn = document.querySelector<HTMLButtonElement>('#mv-toggle')!;
  const collapsed = panel.classList.toggle('collapsed');
  btn.setAttribute('aria-pressed', String(collapsed));
  const hu = getLang() === 'hu';
  btn.textContent = hu
    ? collapsed ? 'M/V diagram ▲' : 'M/V diagram ▼'
    : collapsed ? 'M/V diagrams ▲' : 'M/V diagrams ▼';
}

function updateNodePanel(): void {
  const el = document.querySelector<HTMLDivElement>('#nodepanel')!;
  const hu = getLang() === 'hu';
  if (state.selectedNode == null || !lastMesh || !lastSol) {
    el.innerHTML = '';
    return;
  }
  const insp = inspectNode(lastMesh, lastSol, state.selectedNode);
  el.innerHTML = `
    <div class="mp-header">
      <h2>${hu ? 'Csomópont-vizsgálat' : 'Node inspection'} #${insp.nodeId}</h2>
      <div class="mp-nav">
        <button id="np-close" title="${hu ? 'Bezárás' : 'Close'}">✕</button>
      </div>
    </div>
    ${renderNodeInspection(insp, getLang())}
  `;
  document.querySelector<HTMLButtonElement>('#np-close')!.addEventListener('click', () => {
    state.selectedNode = null;
    updateNodePanel();
    redraw();
  });
}

// ————— Vezérlők —————

const controls = new ControlsPanel(
  document.querySelector<HTMLDivElement>('#controls-root')!,
  {
    onModelChange: (id) => {
      state.modelId = id;
      rebuildAndSolve(true);
    },
    onParamChange: (param, value) => {
      applyParam(param as ParamKey, value);
      rebuildAndSolve();
    },
    onSolve: () => rebuildAndSolve(true),
    onLoadTypeChange: (lt) => {
      state.loadType = lt;
      rebuildAndSolve(true);
    },
    onLangChange: (lang) => {
      setLang(lang);
      localizeStatic(lang);
      controls.render(MODEL_OPTIONS, { modelId: state.modelId, loadType: state.loadType });
      updateLesson(state.modelId, lang);
      rebuildAndSolve();
    },
  },
);

function applyParam(key: ParamKey, value: number | string): void {
  if (key === 'load' && typeof value === 'number') state.load = value;
  if (key === 'density' && typeof value === 'number') state.density = value;
  if (key === 'defscale' && typeof value === 'number') state.defscale = value;
  if (key === 'material' && typeof value === 'string') state.material = value as MaterialKey;
}

// ————— Modell-építés a jelenlegi paraméterekkel —————

function currentMesh(): Mesh {
  const opts = {
    loadN: state.load,
    density: state.density,
    material: state.material,
    loadType: state.loadType,
  };
  switch (state.modelId) {
    case 'cantilever':
      return buildCantilever(opts);
    case 'simplySupported':
      return buildSimplySupported(opts);
    case 'fixedFixed':
      return buildFixedFixed(opts);
    case 'portalFrame':
      return buildPortalFrame(opts);
    case 'corbel':
      return buildCorbel(opts);
    case 'trussBridge':
      return buildTrussBridge(opts);
    case 'plateWithHole':
      return buildPlateWithHole(opts);
    default:
      return buildCantilever(opts);
  }
}

function rebuildAndSolve(flash = false): void {
  resizeCanvas();
  if (flash) flashCanvas();
  let mesh = currentMesh();
  if (state.elementType === 'T6') {
    mesh = convertToT6(mesh);
  }
  const sol = solve(mesh);
  lastMesh = mesh;
  lastSol = sol;
  // Ha a modell változott, a kijelölés érvénytelenné válhat
  if (state.selectedElem != null && !mesh.elements.some((e) => e.id === state.selectedElem)) {
    state.selectedElem = null;
  }
  if (state.selectedNode != null && !mesh.nodes.some((n) => n.id === state.selectedNode)) {
    state.selectedNode = null;
  }
  redraw();
  updateResults(sol, getLang());
  updateLesson(state.modelId, getLang());
  renderLegend(sol.maxVonMises || 1, state.defscale);
  updateMeshStats(mesh);
  updateMathPanel();
  updateNodePanel();
}

// ————— Eredmény- és leckepanel —————

function updateResults(sol: SolutionResult, lang: Lang): void {
  const el = document.querySelector<HTMLDivElement>('#results')!;
  const labels =
    lang === 'hu'
      ? { disp: 'Max. elmozdulás', vm: 'Max. Von Mises', it: 'CG iterációk', res: 'Relatív maradék' }
      : { disp: 'Max. displacement', vm: 'Max. Von Mises', it: 'CG iterations', res: 'Relative residual' };
  el.innerHTML = `
    <div class="result-item"><span>${labels.disp}</span><strong>${formatM(sol.maxDisplacement)}</strong></div>
    <div class="result-item"><span>${labels.vm}</span><strong>${formatPa(sol.maxVonMises)}</strong></div>
    <div class="result-item"><span>${labels.it}</span><strong>${sol.iterations}</strong></div>
    <div class="result-item"><span>${labels.res}</span><strong>${sol.residual.toExponential(1)}</strong></div>
  `;
}

function updateLesson(modelId: string, lang: Lang): void {
  const el = document.querySelector<HTMLDivElement>('#lesson-card')!;
  const lesson = lessonFor(modelId, lang);
  if (!lesson) {
    el.innerHTML = '';
    return;
  }
  const modelLabel = MODEL_LABELS[modelId]?.[lang] ?? modelId;
  el.innerHTML = `
    <h2>${modelLabel}: ${lesson.title[lang]}</h2>
    <p>${lesson.body[lang]}</p>
  `;
}

function localizeStatic(lang: Lang): void {
  const sub = document.querySelector<HTMLParagraphElement>('#subtitle')!;
  sub.textContent = lang === 'hu' ? 'Végeselem-módszer játszótér' : 'Finite Element Method playground';
  const animBtn = document.querySelector<HTMLButtonElement>('#anim-btn');
  if (animBtn && !state.animating) {
    animBtn.textContent = lang === 'hu' ? '▶ Animáció indítása' : '▶ Animate deformation';
  } else if (animBtn) {
    animBtn.textContent = lang === 'hu' ? '⏸ Animáció leállítása' : '⏸ Stop animation';
  }
  // Részletek-fülek fejlécének nyelve
  const tabLabels: Record<TabName, [string, string]> = {
    lesson: ['Lecke', 'Lesson'],
    results: ['Eredmények', 'Results'],
    inspect: ['Vizsgálat', 'Inspect'],
  };
  document.querySelectorAll<HTMLButtonElement>('.tab').forEach((b) => {
    const pair = tabLabels[b.dataset.tab as TabName];
    if (pair) b.textContent = pair[lang === 'hu' ? 0 : 1];
  });
  // M/V panel gomb szövege az összecsukási állapot szerint
  const mvToggle = document.querySelector<HTMLButtonElement>('#mv-toggle');
  const mvCollapsed = document.querySelector<HTMLDivElement>('#mv-panel')?.classList.contains('collapsed');
  if (mvToggle) {
    mvToggle.textContent =
      lang === 'hu'
        ? mvCollapsed ? 'M/V diagram ▲' : 'M/V diagram ▼'
        : mvCollapsed ? 'M/V diagrams ▲' : 'M/V diagrams ▼';
  }
  // modellcímkék frissítése a selectben
  const sel = document.querySelector<HTMLSelectElement>('#model-select');
  if (sel) {
    for (const opt of Array.from(sel.options)) {
      const label = MODEL_LABELS[opt.value];
      if (label) opt.textContent = label[lang];
    }
  }
  updateThemeLabel();
}

// ————— Formázó segédek —————

function formatM(v: number): string {
  if (v < 1e-6) return `${(v * 1e9).toFixed(1)} nm`;
  if (v < 1e-3) return `${(v * 1e6).toFixed(1)} µm`;
  if (v < 1) return `${(v * 1e3).toFixed(2)} mm`;
  return `${v.toFixed(3)} m`;
}

function formatPa(v: number): string {
  if (v >= 1e9) return `${(v / 1e9).toFixed(2)} GPa`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(2)} MPa`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)} kPa`;
  return `${v.toFixed(1)} Pa`;
}

// ————— Legenda —————

function renderLegend(maxVm: number, defscale: number): void {
  const bar = document.querySelector<HTMLDivElement>('#legend-bar')!;
  bar.style.background = stressGradientCss(64);
  // Értékes címkék: 0 és max feszültség, + deformáció-méretarány
  const lo = document.querySelector<HTMLSpanElement>('#legend-lo')!;
  const hi = document.querySelector<HTMLSpanElement>('#legend-hi')!;
  const def = document.querySelector<HTMLSpanElement>('#legend-def')!;
  lo.textContent = '0';
  hi.textContent = formatPa(maxVm);
  def.textContent = `×${defscale}`;
}

// ————— Indítás —————

import { getLang } from './ui/i18n';

// ————— Motor- és elem-típus váltók —————

document.querySelector<HTMLButtonElement>('#engine-canvas')!.addEventListener('click', () => {
  state.engine = 'canvas';
  setEngineButtons();
  redraw();
});
document.querySelector<HTMLButtonElement>('#engine-webgl')!.addEventListener('click', () => {
  if (!webglRenderer) {
    const hu = getLang() === 'hu';
    alert(
      hu
        ? 'A 3D (WebGL) nézet nem elérhető ezen a gépen.\n' + webglError
        : 'The 3D (WebGL) view is not available on this machine.\n' + webglError,
    );
    return;
  }
  state.engine = 'webgl';
  setEngineButtons();
  redraw();
});

function setEngineButtons(): void {
  const c = document.querySelector<HTMLButtonElement>('#engine-canvas')!;
  const w = document.querySelector<HTMLButtonElement>('#engine-webgl')!;
  c.classList.toggle('active', state.engine === 'canvas');
  w.classList.toggle('active', state.engine === 'webgl');
  const t6 = document.querySelector<HTMLButtonElement>('#elem-t6')!;
  t6.textContent = state.elementType;
  t6.classList.toggle('active', state.elementType === 'T6');
}

document.querySelector<HTMLButtonElement>('#elem-t6')!.addEventListener('click', () => {
  state.elementType = state.elementType === 'CST' ? 'T6' : 'CST';
  setEngineButtons();
  rebuildAndSolve(true);
});

// ————— Világos / éjszakai mód —————
// A data-theme attribútum az <html>-en él; a rajzolók és a CSS is ezt olvassák.

function updateThemeLabel(): void {
  const btn = document.querySelector<HTMLButtonElement>('#theme-toggle');
  if (!btn) return;
  const dark = document.documentElement.dataset.theme === 'dark';
  const hu = getLang() === 'hu';
  btn.textContent = dark ? '☀' : '☾';
  btn.setAttribute('aria-pressed', dark ? 'true' : 'false');
  btn.title = hu ? (dark ? 'Világos mód' : 'Éjszakai mód') : dark ? 'Light mode' : 'Dark mode';
}

function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem('elemlab-theme', theme);
  } catch {
    /* privát módban nincs tárhely — a munkamenetre érvényes marad */
  }
  updateThemeLabel();
  redraw();
}

function initTheme(): void {
  let theme: Theme = 'light';
  try {
    const stored = localStorage.getItem('elemlab-theme');
    theme = stored === 'dark' || stored === 'light' ? stored : (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  } catch {
    theme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  document.documentElement.dataset.theme = theme;
  updateThemeLabel();
}

document.querySelector<HTMLButtonElement>('#theme-toggle')!.addEventListener('click', () => {
  applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
});

// ————— Vászon méret-chip + újraszámolás-villanás —————

function updateMeshStats(mesh: Mesh): void {
  const el = document.querySelector<HTMLDivElement>('#mesh-stats');
  if (!el) return;
  const hu = getLang() === 'hu';
  el.textContent = `${mesh.elements.length} ${hu ? 'elem' : 'elements'} · ${mesh.nodes.length} ${hu ? 'csomópont' : 'nodes'}`;
}

/** Lágy fényvillanás a vásznon, amikor új modell/típus érkezik */
function flashCanvas(): void {
  const wrap = canvas.parentElement!;
  wrap.classList.remove('flash');
  void wrap.offsetWidth;
  wrap.classList.add('flash');
}

// ————— Verzió-információ (látható + konzol + DevTools: window.ELEMLAB) —————

const verEl = document.querySelector<HTMLSpanElement>('#verinfo');
if (verEl) {
  verEl.textContent = ` v${APP_VERSION} · build ${BUILD_ID.slice(0, 16).replace('T', ' ')}`;
  verEl.title = `Teljes build-ID: ${BUILD_ID}`;
}
const topVerEl = document.querySelector<HTMLSpanElement>('#topver');
if (topVerEl) topVerEl.textContent = `v${APP_VERSION}`;
console.info(`[ElemLab] v${APP_VERSION} · build ${BUILD_ID}`);
window.ELEMLAB = { version: APP_VERSION, buildId: BUILD_ID };

/** Látható hiba-banner, ha a UI-felépítés közben kivétel keletkezik */
function showFatalBanner(message: string): void {
  const el = document.createElement('div');
  el.className = 'fatal-banner';
  el.setAttribute('role', 'alert');
  el.textContent = message;
  document.body.prepend(el);
}

// ————— Indítás védetten: ha bármelyik lépés elhasal, látható hiba jelenik meg —————
try {
  setLang('hu');
  initTheme();
  initTabs();
  placeTabIndicator();
  document.querySelector<HTMLButtonElement>('#mv-toggle')!.addEventListener('click', toggleMVPanel);
  controls.render(MODEL_OPTIONS, { modelId: state.modelId, loadType: state.loadType });
  document.querySelector<HTMLButtonElement>('#anim-btn')!.addEventListener('click', toggleAnimation);
  resizeCanvas();
  rebuildAndSolve(true);
} catch (err) {
  console.error('[ElemLab] inicializálási hiba:', err);
  showFatalBanner(
    `Hiba az app indításakor: ${err instanceof Error ? err.message : String(err)} — ` +
      `v${APP_VERSION} · build ${BUILD_ID.slice(0, 16)}`,
  );
}
