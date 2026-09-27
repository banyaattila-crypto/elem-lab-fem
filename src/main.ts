/**
 * ElemLab — fő belépési pont.
 * UI elrendezés, modellkezelés, szimuláció és renderelés összekötése.
 */

import './style.css';
import { buildCantilever } from './models/cantilever';
import { buildTrussBridge } from './models/trussBridge';
import { buildPlateWithHole } from './models/plateWithHole';
import { solve } from './fem/solve';
import { Renderer } from './viz/renderer';
import { inspectElement } from './ui/mathpanel';
import { renderInspection } from './ui/mathpanel-view';
import { inspectNode } from './ui/nodepanel';
import { renderNodeInspection } from './ui/nodepanel-view';
import { findElementAt, findNodeAt, screenToWorld } from './viz/picking';
import { viridisCss } from './viz/colormap';
import { ControlsPanel, type ModelOption } from './ui/controls';
import { lessonFor } from './ui/lessons';
import { setLang, type Lang } from './ui/i18n';
import type { Mesh, SolutionResult } from './fem/types';
import type { MaterialKey } from './models/meshgen';

const MODEL_OPTIONS: ModelOption[] = [
  { id: 'cantilever', label: 'Konzolgerenda' },
  { id: 'trussBridge', label: 'Rácsos híd' },
  { id: 'plateWithHole', label: 'Lyukas lemez' },
];

const MODEL_LABELS: Record<string, Record<Lang, string>> = {
  cantilever: { hu: 'Konzolgerenda', en: 'Cantilever beam' },
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
};

let rafId: number | null = null;

/** Az utolsó megoldás — kattintáskor újraszámolás nélkül újrarajzolunk */
let lastMesh: Mesh | null = null;
let lastSol: SolutionResult | null = null;

// ————— UI váz —————

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <header class="topbar">
    <div>
      <h1>ElemLab</h1>
      <p class="subtitle" id="subtitle">Végeselem-módszer játszótér</p>
    </div>
  </header>
  <div class="layout">
    <aside class="sidebar" id="controls-root"></aside>
    <main class="stage">
      <div class="canvas-wrap">
        <canvas id="canvas"></canvas>
        <div class="legend" id="legend">
          <span>0</span>
          <div class="legend-bar" id="legend-bar"></div>
          <span>max</span>
        </div>
        <button id="anim-btn" class="anim-btn" aria-pressed="false">▶ Animáció indítása</button>
      </div>
      <section class="lesson-card" id="lesson-card"></section>
      <section class="results" id="results"></section>
      <section class="mathpanel" id="mathpanel"></section>
      <section class="mathpanel nodepanel" id="nodepanel"></section>
    </main>
  </div>
  <footer>
    <p>ElemLab — végeselem-módszer, oktatási célú bemutató. Saját felelősségre!</p>
  </footer>
`;

const canvas = document.querySelector<HTMLCanvasElement>('#canvas')!;
const renderer = new Renderer(canvas);

// ————— Elemkiválasztás + matematikai panel —————

canvas.addEventListener('click', (ev) => {
  const view = renderer.lastView;
  if (!view || !lastMesh) return;
  const rect = canvas.getBoundingClientRect();
  const world = screenToWorld(ev.clientX - rect.left, ev.clientY - rect.top, view, view.minY);
  // Kattintás-ergonómia: csomópont elsőbbség az elemekkel szemben.
  // Tolerancia = a legkisebb elemméret 30%-a, minimum a háló jellemző méretének töredéke.
  const tol = estimateTolerance(lastMesh);
  state.selectedNode = findNodeAt(lastMesh, world.x, world.y, tol);
  state.selectedElem =
    state.selectedNode == null ? findElementAt(lastMesh, world.x, world.y) : null;
  updateMathPanel();
  updateNodePanel();
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

function redraw(): void {
  if (!lastMesh || !lastSol) return;
  renderer.render(lastMesh, lastSol, {
    deformationScale: state.defscale,
    stressMax: lastSol.maxVonMises || 1,
    showMeshEdges: true,
    highlight: state.selectedElem,
    highlightNode: state.selectedNode,
    phase: state.phase,
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
        <h2>${hu ? 'Elemvizsgálat' : 'Element inspection'} #${insp.elemId}</h2>
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
  canvas.height = Math.max(320, Math.min(560, wrap.clientWidth * 0.62));
}
window.addEventListener('resize', () => {
  resizeCanvas();
  rebuildAndSolve();
});

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
      rebuildAndSolve();
    },
    onParamChange: (param, value) => {
      applyParam(param as ParamKey, value);
      rebuildAndSolve();
    },
    onSolve: () => rebuildAndSolve(),
    onLangChange: (lang) => {
      setLang(lang);
      localizeStatic(lang);
      controls.render(MODEL_OPTIONS);
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
  };
  switch (state.modelId) {
    case 'cantilever':
      return buildCantilever(opts);
    case 'trussBridge':
      return buildTrussBridge(opts);
    case 'plateWithHole':
      return buildPlateWithHole(opts);
    default:
      return buildCantilever(opts);
  }
}

function rebuildAndSolve(): void {
  resizeCanvas();
  const mesh = currentMesh();
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
  // modellcímkék frissítése a selectben
  const sel = document.querySelector<HTMLSelectElement>('#model-select');
  if (sel) {
    for (const opt of Array.from(sel.options)) {
      const label = MODEL_LABELS[opt.value];
      if (label) opt.textContent = label[lang];
    }
  }
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

function renderLegend(): void {
  const bar = document.querySelector<HTMLDivElement>('#legend-bar')!;
  const stops = 10;
  const colors: string[] = [];
  for (let i = 0; i <= stops; i++) colors.push(viridisCss(i / stops));
  bar.style.background = `linear-gradient(to right, ${colors.join(',')})`;
}

// ————— Indítás —————

import { getLang } from './ui/i18n';

setLang('hu');
controls.render(MODEL_OPTIONS);
renderLegend();
document.querySelector<HTMLButtonElement>('#anim-btn')!.addEventListener('click', toggleAnimation);
resizeCanvas();
rebuildAndSolve();
