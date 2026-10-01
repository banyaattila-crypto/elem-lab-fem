/**
 * ElemLab — fő belépési pont.
 * UI elrendezés, modellkezelés, szimuláció és renderelés összekötése.
 */

import './style.css';
import { buildCorbel } from './models/corbel';
import { buildPlateWithHole } from './models/plateWithHole';
import { convertToT6 } from './models/t6convert';
import { solve } from './fem/solve';
import {
  buildFrameCantilever,
  buildFrameSimplySupported,
  buildFrameFixedFixed,
  buildFramePortal,
  buildFrameTrussBridge,
  FRAME_MATERIALS,
  type FrameMaterialKey,
} from './models/frames';
import { solveFrame, findFrameBeamAt, findFrameNodeAt, nodeMoveIsSafe } from './fem/frame';
import type { FrameModel, FrameSolution } from './fem/frame';
import { Renderer } from './viz/renderer';
import { WebGLRenderer } from './viz/webgl-renderer';
import { FrameRenderer } from './viz/frameRenderer';
import { inspectElement } from './ui/mathpanel';
import { renderInspection } from './ui/mathpanel-view';
import { inspectNode } from './ui/nodepanel';
import { renderNodeInspection } from './ui/nodepanel-view';
import { inspectFrameElement, renderFrameElementInspection, inspectFrameNode, renderFrameNodeInspection } from './ui/frameinspect';
import { findElementAt, findNodeAt, screenToWorld, type ViewTransform } from './viz/picking';
import { resolveSnap, type SnapResult } from './viz/snap';
import { stressGradientCss } from './viz/colormap';
import { MVPanel } from './viz/diagrams';
import { FrameMVPanel } from './viz/frame-panel';
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

/** Vázmodellek: a frame.ts (1D rúd/rács) megoldót használják */
const FRAME_MODELS = new Set(['cantilever', 'simplySupported', 'fixedFixed', 'portalFrame', 'trussBridge']);

const FRAME_MATERIAL_LIST: ModelOption[] = Object.entries(FRAME_MATERIALS).map(([key, m]) => ({
  id: key,
  label: m.name,
}));

/** Jelenlegi modell váz-e (frame-megoldó)? */
function isFrame(): boolean {
  return FRAME_MODELS.has(state.modelId);
}

type ParamKey = 'load' | 'density' | 'material' | 'defscale';

const state = {
  modelId: 'cantilever',
  load: 1000,
  density: 6,
  material: 'steel' as MaterialKey,
  frameMaterial: 's235' as FrameMaterialKey,
  defscale: 500,
  selectedElem: null as number | null,
  selectedNode: null as number | null,
  animating: false,
  phase: 1,
  engine: 'canvas' as 'canvas' | 'webgl',
  elementType: 'CST' as 'CST' | 'T6',
  /** Terhelés-típus: pontterhelés vagy elosztott (csak gerenda-modellek nél) */
  loadType: 'point' as 'point' | 'distributed',
  /** Séma-mód: VEM nélküli modell — deformáció és feszültség-színezés nélkül (alap: be) */
  schemaMode: true,
  /**
   * A felhasználó által húzott csomópont-pozíciók (mágneses végpont).
   * Külön tárolva, mert a modell minden újrabeállításkor újragenerálódik —
   * a húzott geometriának viszont meg kell maradnia akkor is, ha közben a
   * terhelést vagy az anyagot váltja a felhasználó.
   */
  frameNodeOverrides: {} as Record<number, { x: number; y: number }>,
};

let rafId: number | null = null;

/** Az utolsó megoldás — kattintáskor újraszámolás nélkül újrarajzolunk */
let lastMesh: Mesh | null = null;
let lastSol: SolutionResult | null = null;

/** Utolsó váz-megoldás (frame-modellnél) */
let lastFrameModel: FrameModel | null = null;
let lastFrameSol: FrameSolution | null = null;

/** A jelenlegi modellhez tartozó anyag-id (váz / lemez) */
function currentMaterial(): string {
  return isFrame() ? state.frameMaterial : state.material;
}

/** Az anyag-választó listája a jelenlegi modellhez */
function currentMaterialList(): ModelOption[] | undefined {
  return isFrame() ? FRAME_MATERIAL_LIST : undefined;
}

// ————— UI váz —————

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <header class="topbar">
    <div class="brand">
      <svg class="brand-mark" viewBox="0 0 48 48" aria-hidden="true">
        <rect x="1" y="1" width="46" height="46" rx="14" fill="#2456b8"/>
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
          <button id="mode-schema" title="Séma — VEM nélküli modell: deformáció és feszültség-színezés nélkül">Séma</button>
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
const frameMvPanel = new FrameMVPanel(mvCanvas);
const renderer = new Renderer(canvas);
const frameRenderer = new FrameRenderer(canvas);
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
  if (isFrame()) {
    if (!lastFrameModel) return;
    const view = frameRenderer.lastView;
    if (!view) return;
    const rect = canvas.getBoundingClientRect();
    const world = screenToWorld(ev.clientX - rect.left, ev.clientY - rect.top, view);
    const tol = framePickTolerance(lastFrameModel);
    state.selectedNode = findFrameNodeAt(lastFrameModel, world.x, world.y, tol);
    state.selectedElem =
      state.selectedNode == null ? findFrameBeamAt(lastFrameModel, world.x, world.y, tol) : null;
    if (state.selectedNode != null || state.selectedElem != null) setTab('inspect');
    updateFrameMathPanel();
    updateFrameNodePanel();
    redraw();
    return;
  }
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

/** Vázkattintás tolerancia: a modell méretétől függő törpe sugár */
function framePickTolerance(model: FrameModel): number {
  const xs = model.nodes.map((n) => n.x);
  const ys = model.nodes.map((n) => n.y);
  const dia = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  return Math.max(dia * 0.03, 0.02);
}

// ————— Zoom / pan (Canvas 2D) —————
// Görgő: zoom a mutató körül; húzás: mozgatás; dupla kattintás: nézet visszaállítása.
canvas.addEventListener('wheel', (ev) => {
  if (state.engine !== 'canvas') return;
  ev.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const factor = Math.exp(-ev.deltaY * 0.0015);
  const active = isFrame() ? frameRenderer : renderer;
  active.zoomAt(ev.clientX - rect.left, ev.clientY - rect.top, factor);
  redraw();
}, { passive: false });

let panning = false;
let panStartX = 0;
let panStartY = 0;
let panMoved = false;

// ————— Mágneses csomópont-húzás (vázmodellek) —————
// A váz csomópontjai foghatók meg és húzhatók. A végpont a pontrácsra és a
// szomszédos szakaszok végpontjaira pattan (mágnes), Alt lenyomva szabad mozgás.

/** A fogantyú megragadási sugara [px] — nem a kattintási tűrés, az túl széles */
const NODE_GRAB_PX = 12;

let draggingNode: number | null = null;
/** A húzás kezdeti pozíciója — Escape-re ide állunk vissza */
let dragOrigin: { x: number; y: number } | null = null;
/** Az utolsó pillanýítás (visszajelző gyűrűhöz); 'none' → nincs jelzés */
let dragSnap: SnapResult | null = null;

/** Képernyő- és világkoordináta a canvas rectből */
function canvasWorld(ev: { clientX: number; clientY: number }, view: ViewTransform): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  return screenToWorld(ev.clientX - rect.left, ev.clientY - rect.top, view);
}

/** Van-e csomópont a mutató alatt? (kurzorkezdés + megragadás) */
function nodeUnderPointer(ev: { clientX: number; clientY: number }): number | null {
  if (!isFrame()) return null;
  const model = lastFrameModel;
  const view = frameRenderer.lastView;
  if (!model || !view) return null;
  const w = canvasWorld(ev, view);
  return findFrameNodeAt(model, w.x, w.y, NODE_GRAB_PX / view.scale);
}

/** true, ha sikerült megragadni (ilyenkor NEM paneltunk) */
function beginNodeDrag(ev: PointerEvent): boolean {
  const model = lastFrameModel;
  const view = frameRenderer.lastView;
  const id = nodeUnderPointer(ev);
  if (!model || !view || id == null) return false;
  const node = model.nodes.find((n) => n.id === id);
  if (!node) return false;
  draggingNode = id;
  dragOrigin = { x: node.x, y: node.y };
  dragSnap = null;
  state.selectedNode = id;
  state.selectedElem = null;
  panMoved = true; // a húzás ne essen át kattintásvá → ne legyen kijelölés
  canvas.style.cursor = 'grabbing';
  setTab('inspect'); // az élő csomópont-adatok legyenek láthatók húzás közben
  redraw();
  return true;
}

/** Élő mozgatás: pillanýítás, felülírás, azonnali újraszámolás */
function moveDraggedNode(ev: PointerEvent): void {
  const model = lastFrameModel;
  const view = frameRenderer.lastView;
  if (!model || !view || draggingNode == null) return;
  const node = model.nodes.find((n) => n.id === draggingNode);
  if (!node) return;
  const w = canvasWorld(ev, view);
  const snap = resolveSnap(w.x, w.y, model, view, draggingNode, {
    enabled: !ev.altKey, // Alt = pillanýítás nélküli szabad mozgás
  });
  // A mágnes szándékosan a szomszédos végpontra is rátaszít — de nulla
  // hosszú rúdban a megoldó NaN-t adna, ezért ezt a mozgást elutasítjuk.
  if (!nodeMoveIsSafe(model, draggingNode, snap.x, snap.y)) {
    dragSnap = null; // nincs gyűrű: a cél érvénytelen volt
    redraw();
    return;
  }
  const moved = node.x !== snap.x || node.y !== snap.y;
  node.x = snap.x;
  node.y = snap.y;
  state.frameNodeOverrides[node.id] = { x: snap.x, y: snap.y };
  dragSnap = snap.kind === 'none' ? null : snap;
  // Élő megoldás: a húzott végpont alakítsa azonnal a feszültségi képet.
  // A rács miatt a legtöbb mozgás nem változtat pozíciót → ekkor nincs miért
  // újraoldani (a feszültségi kép is változatlan marad).
  if (moved) lastFrameSol = solveFrame(model, { samplesPerBeam: state.density });
  updateDragReadout(model, node.id, snap);
  redraw();
}

/**
 * Húzás közbeni élő kiolvasó a méret-chip helyén: a fogantyú világkoordinátája
 * és hogy mit kapott el. Ez az, amivel a „mágneses" érzés ellenőrizhető —
 * látszik, hogy a számok pontrácsra kerekítve ugyanazok minden alkalommal,
 * és a csomópont-mágnesnél épp egy másik csomópont számaira ugranak.
 * A szülő `rebuildAndSolve()` hívás állítja vissza a szokásos feliratot.
 */
function updateDragReadout(model: FrameModel, nodeId: number, snap: SnapResult): void {
  const el = document.querySelector<HTMLDivElement>('#mesh-stats');
  if (!el) return;
  const node = model.nodes.find((n) => n.id === nodeId);
  if (!node) return;
  const hu = getLang() === 'hu';
  const target =
    snap.nodeId != null && snap.nodeId !== nodeId
      ? ` → ${hu ? 'csomópont' : 'node'} ${snap.nodeId}`
      : snap.kind === 'grid'
        ? ` · ${hu ? 'rács' : 'grid'}`
        : snap.kind === 'none'
          ? ` · ${hu ? 'szabad' : 'free'}`
          : '';
  el.textContent = `x = ${node.x.toFixed(3)} ${hu ? 'm' : 'm'} · y = ${node.y.toFixed(3)} m${target}`;
}

/** Befejezés: teljes felülírás (eredmények, statisztika, matematikai panel) */
function finishNodeDrag(cancel = false): void {
  if (draggingNode == null) return;
  if (cancel && dragOrigin) {
    state.frameNodeOverrides[draggingNode] = { x: dragOrigin.x, y: dragOrigin.y };
  }
  draggingNode = null;
  dragOrigin = null;
  dragSnap = null;
  canvas.style.cursor = '';
  // A nézet maradjon a helyén: a felhasználó nem egy új modellt választott,
  // hanem egy meglévő csomópontot húzott el.
  frameRenderer.preserveView();
  rebuildAndSolve();
  renderControls(); // a visszaállító gomb mostantól aktív
}

canvas.addEventListener('pointerdown', (ev) => {
  if (state.engine !== 'canvas' || ev.button !== 0) return;
  if (beginNodeDrag(ev)) return;
  panning = true;
  panMoved = false;
  panStartX = ev.clientX;
  panStartY = ev.clientY;
});
window.addEventListener('pointermove', (ev) => {
  if (draggingNode != null) {
    moveDraggedNode(ev);
    return;
  }
  if (!panning) {
    // Kurzorkezdés: a csomópont megfogható → ezt mutassuk
    canvas.style.cursor = nodeUnderPointer(ev) != null ? 'grab' : '';
    return;
  }
  const dsx = ev.clientX - panStartX;
  const dsy = ev.clientY - panStartY;
  panStartX = ev.clientX;
  panStartY = ev.clientY;
  if (Math.abs(dsx) + Math.abs(dsy) > 3) panMoved = true;
  (isFrame() ? frameRenderer : renderer).panBy(dsx, dsy);
  redraw();
});
window.addEventListener('pointerup', () => {
  panning = false;
  if (draggingNode != null) finishNodeDrag();
});
window.addEventListener('keydown', (ev) => {
  if (ev.key !== 'Escape' || draggingNode == null) return;
  finishNodeDrag(true); // megszakítás → vissza a húzás előtti helyre
});
canvas.addEventListener('dblclick', () => {
  if (state.engine !== 'canvas') return;
  (isFrame() ? frameRenderer : renderer).resetView();
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
  // Vázmodell: saját renderer + N/M/V panel (a 3D és a T6 nem érvényes itt)
  if (isFrame()) {
    if (!lastFrameModel || !lastFrameSol) return;
    frameMvPanel.setData(lastFrameModel, lastFrameSol);
    if (state.engine === 'webgl') {
      state.engine = 'canvas';
      setEngineButtons();
    }
    frameRenderer.render(lastFrameModel, lastFrameSol, {
      deformationScale: state.defscale,
      stressMax: lastFrameSol.maxStress || 1,
      highlight: state.selectedElem,
      highlightNode: state.selectedNode,
      phase: state.phase,
      dragNode: draggingNode,
      snap: dragSnap,
      deformed: !state.schemaMode,
      stressColors: !state.schemaMode,
    });
    return;
  }
  if (!lastMesh || !lastSol) return;
  // Séma-mód csak 2D-ben él (a WebGL nem tudja a színtelen/deformálatlan módot)
  if (state.engine === 'webgl' && state.schemaMode) {
    state.engine = 'canvas';
    setEngineButtons();
  }
  const common = {
    deformationScale: state.defscale,
    stressMax: lastSol.maxVonMises || 1,
    showMeshEdges: true,
    highlight: state.selectedElem,
    highlightNode: state.selectedNode,
    phase: state.phase,
    deformed: !state.schemaMode,
    stressColors: !state.schemaMode,
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
  if (isFrame()) {
    updateFrameMathPanel();
    return;
  }
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

/** Váz-rúd vizsgálat panel (frame.ts eredményből) */
function updateFrameMathPanel(): void {
  const el = document.querySelector<HTMLDivElement>('#mathpanel')!;
  const hu = getLang() === 'hu';
  if (state.selectedElem == null || !lastFrameModel || !lastFrameSol) {
    el.innerHTML = `<div class="mp-empty">${hu ? '👆 Kattints egy rúdra a canvason — a belső erők és feszültségek jelennek meg.' : '👆 Click a member on the canvas — internal forces and stresses appear.'}</div>`;
    return;
  }
  try {
    const insp = inspectFrameElement(lastFrameModel, lastFrameSol, state.selectedElem);
    const n = lastFrameModel.beams.length;
    el.innerHTML = `
      <div class="mp-header">
        <h2>${hu ? 'Rúd-vizsgálat' : 'Member inspection'} #${insp.beamId} <span class="mp-tag">${hu ? 'rúd' : 'member'}</span></h2>
        <div class="mp-nav">
          <button id="mp-prev" title="${hu ? 'Előző rúd' : 'Previous member'}">◀</button>
          <span class="mp-count">${insp.beamId + 1} / ${n}</span>
          <button id="mp-next" title="${hu ? 'Következő rúd' : 'Next member'}">▶</button>
          <button id="mp-close" title="${hu ? 'Bezárás' : 'Close'}">✕</button>
        </div>
      </div>
      ${renderFrameElementInspection(insp, getLang())}
    `;
    const navId = state.selectedElem ?? 0;
    document.querySelector<HTMLButtonElement>('#mp-prev')!.addEventListener('click', () => {
      state.selectedElem = (navId - 1 + n) % n;
      updateFrameMathPanel();
      redraw();
    });
    document.querySelector<HTMLButtonElement>('#mp-next')!.addEventListener('click', () => {
      state.selectedElem = (navId + 1) % n;
      updateFrameMathPanel();
      redraw();
    });
    document.querySelector<HTMLButtonElement>('#mp-close')!.addEventListener('click', () => {
      state.selectedElem = null;
      updateFrameMathPanel();
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

/** Az M/V ill. N/M/V panel gomb felirata a modell-típus és a nyelv szerint */
function mvToggleLabel(): string {
  const hu = getLang() === 'hu';
  const name = isFrame()
    ? hu ? 'N/M/V diagram' : 'N/M/V diagrams'
    : hu ? 'M/V diagram' : 'M/V diagrams';
  const collapsed = document.querySelector<HTMLDivElement>('#mv-panel')?.classList.contains('collapsed') ?? false;
  return `${name} ${collapsed ? '▲' : '▼'}`;
}

function toggleMVPanel(): void {
  const panel = document.querySelector<HTMLDivElement>('#mv-panel')!;
  const btn = document.querySelector<HTMLButtonElement>('#mv-toggle')!;
  const collapsed = panel.classList.toggle('collapsed');
  btn.setAttribute('aria-pressed', String(collapsed));
  btn.textContent = mvToggleLabel();
}

function updateNodePanel(): void {
  if (isFrame()) {
    updateFrameNodePanel();
    return;
  }
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

/** Váz-csomópont vizsgálat panel (frame.ts eredményből) */
function updateFrameNodePanel(): void {
  const el = document.querySelector<HTMLDivElement>('#nodepanel')!;
  const hu = getLang() === 'hu';
  if (state.selectedNode == null || !lastFrameModel || !lastFrameSol) {
    el.innerHTML = '';
    return;
  }
  try {
    const insp = inspectFrameNode(lastFrameModel, lastFrameSol, state.selectedNode);
    el.innerHTML = `
      <div class="mp-header">
        <h2>${hu ? 'Csomópont-vizsgálat' : 'Node inspection'} #${insp.nodeId}</h2>
        <div class="mp-nav">
          <button id="np-close" title="${hu ? 'Bezárás' : 'Close'}">✕</button>
        </div>
      </div>
      ${renderFrameNodeInspection(insp, getLang())}
    `;
    document.querySelector<HTMLButtonElement>('#np-close')!.addEventListener('click', () => {
      state.selectedNode = null;
      updateFrameNodePanel();
      redraw();
    });
  } catch {
    state.selectedNode = null;
    updateFrameNodePanel();
  }
}

// ————— Vezérlők —————

const controls = new ControlsPanel(
  document.querySelector<HTMLDivElement>('#controls-root')!,
  {
    onModelChange: (id) => {
      state.modelId = id;
      // Más modell más csomópont-számozás → a húzott geometria nem vihető át
      state.frameNodeOverrides = {};
      state.selectedNode = null;
      state.selectedElem = null;
      updateFrameUiState();
      renderControls();
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
    onResetGeometry: () => {
      if (Object.keys(state.frameNodeOverrides).length === 0) return;
      state.frameNodeOverrides = {};
      // Itt a nézet VISZONT visszaáll: a modell az eredeti kiterjedéséhez
      // tér vissza, és egy esetleg razozott nézet félre kerülne.
      rebuildAndSolve(true);
    },
    onLangChange: (lang) => {
      setLang(lang);
      localizeStatic(lang);
      renderControls();
      updateLesson(state.modelId, lang);
      rebuildAndSolve();
    },
  },
);

/**
 * A vezérlőpanel frissítése a jelenlegi állapottól. Egyetlen helyen, hogy a
 * gomb tiltottsága (van-e elhúzott csomópont) ne csoljon el a hívóktól.
 */
function renderControls(): void {
  controls.render(
    MODEL_OPTIONS,
    {
      modelId: state.modelId,
      loadType: state.loadType,
      material: currentMaterial(),
      frame: isFrame(),
      geometryEdited: Object.keys(state.frameNodeOverrides).length > 0,
    },
    currentMaterialList(),
  );
}

function applyParam(key: ParamKey, value: number | string): void {
  if (key === 'load' && typeof value === 'number') state.load = value;
  if (key === 'density' && typeof value === 'number') state.density = value;
  if (key === 'defscale' && typeof value === 'number') state.defscale = value;
  if (key === 'material' && typeof value === 'string') {
    if (isFrame()) state.frameMaterial = value as FrameMaterialKey;
    else state.material = value as MaterialKey;
  }
}

/** Váz-modellnél a 3D (WebGL) és a T6 kapcsoló tiltása */
function updateFrameUiState(): void {
  const w = document.querySelector<HTMLButtonElement>('#engine-webgl');
  const t6 = document.querySelector<HTMLButtonElement>('#elem-t6');
  if (w) {
    w.disabled = isFrame();
    w.title = isFrame()
      ? 'A 3D nézet csak lemez-modellekhez érhető el'
      : 'WebGL — folytonos szín, forgatás';
  }
  if (t6) {
    t6.disabled = isFrame();
    t6.title = isFrame()
      ? 'A T6 elem csak lemez-modellekhez érhető el'
      : 'Elem-típus: lineáris CST ⇄ kvadratikus T6';
  }
  if (isFrame()) {
    state.engine = 'canvas';
    state.elementType = 'CST';
  }
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
    case 'corbel':
      return buildCorbel(opts);
    case 'plateWithHole':
      return buildPlateWithHole(opts);
    default:
      return buildCorbel(opts);
  }
}

/** Vázmodell-építő a frames.ts katalógusból (a terhelés a load csúszka) */
function currentFrameModel(): FrameModel {
  const opts = {
    loadN: state.load,
    material: FRAME_MATERIALS[state.frameMaterial] ?? FRAME_MATERIALS.s235!,
    loadType: state.loadType,
  };
  switch (state.modelId) {
    case 'cantilever':
      return applyFrameNodeOverrides(buildFrameCantilever(opts));
    case 'simplySupported':
      return applyFrameNodeOverrides(buildFrameSimplySupported(opts));
    case 'fixedFixed':
      return applyFrameNodeOverrides(buildFrameFixedFixed(opts));
    case 'portalFrame':
      return applyFrameNodeOverrides(buildFramePortal(opts));
    case 'trussBridge':
      return applyFrameNodeOverrides(buildFrameTrussBridge(opts));
    default:
      return applyFrameNodeOverrides(buildFrameCantilever(opts));
  }
}

/**
 * A húzott csomópontok ráíródnak az újragenerált modellre. Csak az azonos
 * id-jú csomópontok mozognak; a támaszok és a terhek id alapján kötődnek,
 * ezért a húzás magával viszi őket is.
 */
function applyFrameNodeOverrides(model: FrameModel): FrameModel {
  const ov = state.frameNodeOverrides;
  for (const node of model.nodes) {
    const o = ov[node.id];
    if (o) {
      node.x = o.x;
      node.y = o.y;
    }
  }
  return model;
}

function rebuildAndSolve(flash = false): void {
  resizeCanvas();
  if (flash) flashCanvas();
  // Vázmodell: frame-megoldó + váz-renderer (a sűrűség = mintavételezési sűrűség)
  if (isFrame()) {
    const model = currentFrameModel();
    const sol = solveFrame(model, { samplesPerBeam: state.density });
    lastFrameModel = model;
    lastFrameSol = sol;
    if (state.selectedElem != null && !model.beams.some((b) => b.id === state.selectedElem)) {
      state.selectedElem = null;
    }
    if (state.selectedNode != null && !model.nodes.some((n) => n.id === state.selectedNode)) {
      state.selectedNode = null;
    }
    redraw();
    updateResultsFrame(sol, getLang());
    updateLesson(state.modelId, getLang());
    renderLegend(sol.maxStress || 1, state.defscale);
    updateFrameStats(model);
    updateFrameMathPanel();
    updateFrameNodePanel();
    return;
  }
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

/** Eredmény-panel váz-modellekhez: elmozdulás + feszültség + belső erők */
function updateResultsFrame(sol: FrameSolution, lang: Lang): void {
  const el = document.querySelector<HTMLDivElement>('#results')!;
  const labels =
    lang === 'hu'
      ? { disp: 'Max. elmozdulás', sig: 'Max. feszültség σ', maxM: 'Max. nyomaték M', it: 'CG iterációk' }
      : { disp: 'Max. displacement', sig: 'Max. stress σ', maxM: 'Max. moment M', it: 'CG iterations' };
  el.innerHTML = `
    <div class="result-item"><span>${labels.disp}</span><strong>${formatM(sol.maxDisplacement)}</strong></div>
    <div class="result-item"><span>${labels.sig}</span><strong>${formatPa(sol.maxStress)}</strong></div>
    <div class="result-item"><span>${labels.maxM}</span><strong>${formatNm(sol.maxM)}</strong></div>
    <div class="result-item"><span>${labels.it}</span><strong>${sol.iterations}</strong></div>
    <div class="result-item"><span title="relatív maradék">res</span><strong>${sol.residual.toExponential(1)}</strong></div>
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
  if (mvToggle) {
    mvToggle.textContent = mvToggleLabel();
  }
  // Séma-mód gomb felirata
  const schemaBtn = document.querySelector<HTMLButtonElement>('#mode-schema');
  if (schemaBtn) {
    schemaBtn.textContent = lang === 'hu' ? 'Séma' : 'Model';
    schemaBtn.title = lang === 'hu'
      ? 'Séma — VEM nélküli modell: deformáció és feszültség-színezés nélkül'
      : 'Model — without FEM results: no deformation and no stress coloring';
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

function formatNm(v: number): string {
  if (v >= 1e6) return `${(v / 1e6).toFixed(2)} MNm`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(2)} kNm`;
  return `${v.toFixed(1)} Nm`;
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
  exitSchemaMode(); // 2D = eredmény-nézet
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
  exitSchemaMode(); // 3D = eredmény-nézet
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
  const schema = document.querySelector<HTMLButtonElement>('#mode-schema');
  if (schema) schema.classList.toggle('active', state.schemaMode);
}

// ————— Séma-mód: VEM nélküli modell (deformáció és színezés nélkül) —————

/** Séma-mód UI-állapota: legenda rejtve, gomb aktív */
function applySchemaModeUi(): void {
  const legend = document.querySelector<HTMLDivElement>('#legend');
  if (legend) legend.style.display = state.schemaMode ? 'none' : '';
  setEngineButtons();
}

/** Kilépés a sémából (2D/3D/CST gomb = eredmény-nézet kérése) */
function exitSchemaMode(): void {
  if (!state.schemaMode) return;
  state.schemaMode = false;
  applySchemaModeUi();
}

document.querySelector<HTMLButtonElement>('#mode-schema')!.addEventListener('click', () => {
  state.schemaMode = !state.schemaMode;
  applySchemaModeUi();
  redraw();
});

document.querySelector<HTMLButtonElement>('#elem-t6')!.addEventListener('click', () => {
  exitSchemaMode(); // elem-típus váltás = eredmény-nézet
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

/** Váz-csomópont/rúd számláló */
function updateFrameStats(model: FrameModel): void {
  const el = document.querySelector<HTMLDivElement>('#mesh-stats');
  if (!el) return;
  const hu = getLang() === 'hu';
  el.textContent = `${model.beams.length} ${hu ? 'rúd' : 'members'} · ${model.nodes.length} ${hu ? 'csomópont' : 'nodes'}`;
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
/** Rövid belső build-jel (hónapnap-óraperc): minden Vercel deploynál más → látszik, friss-e */
const buildShort = (() => {
  const d = new Date(BUILD_ID);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
})();
if (topVerEl) {
  topVerEl.textContent = `v${APP_VERSION} · b${buildShort}`;
  topVerEl.title = `Belső build-ID: ${BUILD_ID}`;
}
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
  applySchemaModeUi(); // séma az alapértelmezett nézet → legenda rejtve
  document.querySelector<HTMLButtonElement>('#mv-toggle')!.addEventListener('click', toggleMVPanel);
  renderControls();
  updateFrameUiState();
  const mvBtn = document.querySelector<HTMLButtonElement>('#mv-toggle');
  if (mvBtn) mvBtn.textContent = mvToggleLabel();
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
