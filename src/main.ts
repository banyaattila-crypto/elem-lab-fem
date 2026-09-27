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
};

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
      </div>
      <section class="lesson-card" id="lesson-card"></section>
      <section class="results" id="results"></section>
    </main>
  </div>
  <footer>
    <p>ElemLab — végeselem-módszer, oktatási célú bemutató. Saját felelősségre!</p>
  </footer>
`;

const canvas = document.querySelector<HTMLCanvasElement>('#canvas')!;
const renderer = new Renderer(canvas);

function resizeCanvas(): void {
  const wrap = canvas.parentElement!;
  canvas.width = wrap.clientWidth;
  canvas.height = Math.max(320, Math.min(560, wrap.clientWidth * 0.62));
}
window.addEventListener('resize', () => {
  resizeCanvas();
  rebuildAndSolve();
});

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
  renderer.render(mesh, sol, {
    deformationScale: state.defscale,
    stressMax: sol.maxVonMises || 1,
    showMeshEdges: true,
  });
  updateResults(sol, getLang());
  updateLesson(state.modelId, getLang());
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
resizeCanvas();
rebuildAndSolve();
