/**
 * Vezérlőpanel: modellválasztó, terhelés csúszka, anyagválasztó,
 * deformáció-nagyítás, nyelvváltó és „Számítás" gomb.
 */

import { t, type Lang } from './i18n';
import { MATERIALS } from '../models/meshgen';

export interface ControlsCallbacks {
  onModelChange: (modelId: string) => void;
  onParamChange: (param: string, value: number | string) => void;
  onSolve: () => void;
  onLangChange: (lang: Lang) => void;
  /** Terhelés-típus váltás (pont ⇄ elosztott) */
  onLoadTypeChange: (loadType: 'point' | 'distributed') => void;
  /** A húzott váz-geometria visszaállítása az eredetire (csak váznál aktív) */
  onResetGeometry: () => void;
}

/** Gerenda-modellek, ahol a terhelés-típus választható */
const BEAM_MODELS = new Set(['cantilever', 'simplySupported', 'fixedFixed']);

/** Terhelés-erő formázó a csúszka érték-kijelzőjéhez */
function fmtLoad(v: number): string {
  return v % 1000 === 0 ? `${v / 1000} kN` : `${v} N`;
}

export interface ModelOption {
  id: string;
  label: string;
}

export class ControlsPanel {
  private root: HTMLElement;
  private cb: ControlsCallbacks;

  constructor(root: HTMLElement, cb: ControlsCallbacks) {
    this.root = root;
    this.cb = cb;
  }

  render(
    modelOptions: ModelOption[],
    current?: {
      modelId: string;
      loadType: 'point' | 'distributed';
      material?: string;
      /** Vázmodell → megjelenik a geometria-visszaállító gomb */
      frame?: boolean;
      /** Van-e elhúzott csomópont (a gomb ennek megfelelően aktív) */
      geometryEdited?: boolean;
    },
    materials?: ModelOption[],
  ): void {
    this.root.innerHTML = '';

    // 1) Modellválasztó
    const modelSel = this.select(
      'model-select',
      t('model.select'),
      modelOptions,
      (v) => this.cb.onModelChange(v),
    );
    this.root.appendChild(modelSel);

    // 1b) Terhelés-típus váltó — csak gerenda-modelleknél
    if (current && BEAM_MODELS.has(current.modelId)) {
      const ltOptions: ModelOption[] = [
        { id: 'point', label: t('controls.loadPoint') },
        { id: 'distributed', label: t('controls.loadDistributed') },
      ];
      const ltSel = this.select(
        'loadtype-select',
        t('controls.loadType'),
        ltOptions,
        (v) => this.cb.onLoadTypeChange(v as 'point' | 'distributed'),
      );
      (ltSel.querySelector('select') as HTMLSelectElement).value = current.loadType;
      this.root.appendChild(ltSel);
    }

    // 2) Terhelés csúszka
    this.root.appendChild(
      this.slider('load', t('controls.load'), 0, 10000, 100, 1000, fmtLoad, (v) =>
        this.cb.onParamChange('load', v),
      ),
    );

    // 3) Hálósűrűség csúszka
    this.root.appendChild(
      this.slider('density', t('controls.density'), 1, 5, 1, 3, (v) => `${v}`, (v) =>
        this.cb.onParamChange('density', v),
      ),
    );

    // 4) Anyagválasztó (modellfüggő: váz → FRAME_MATERIALS, lemez → MATERIALS)
    const matOptions: ModelOption[] = materials ?? Object.entries(MATERIALS).map(
      ([key, m]) => ({ id: key, label: m.name }),
    );
    const matSel = this.select(
      'material-select',
      t('controls.material'),
      matOptions,
      (v) => this.cb.onParamChange('material', v),
    );
    if (current?.material) {
      (matSel.querySelector('select') as HTMLSelectElement).value = current.material;
    }
    this.root.appendChild(matSel);

    // 5) Deformáció-nagyítás
    this.root.appendChild(
      this.slider('defscale', t('controls.deformation'), 10, 5000, 10, 500, (v) => `×${v}`, (v) =>
        this.cb.onParamChange('defscale', v),
      ),
    );

    // 6) Számítás gomb + nyelvváltó egy sorban
    const btn = document.createElement('button');
    btn.id = 'solve-btn';
    btn.textContent = t('controls.solve');
    btn.addEventListener('click', () => this.cb.onSolve());

    const langDiv = document.createElement('div');
    langDiv.className = 'control-group lang-switch';
    const huBtn = document.createElement('button');
    huBtn.textContent = 'HU';
    huBtn.addEventListener('click', () => this.cb.onLangChange('hu'));
    const enBtn = document.createElement('button');
    enBtn.textContent = 'EN';
    enBtn.addEventListener('click', () => this.cb.onLangChange('en'));
    langDiv.append(huBtn, enBtn);

    const actionRow = document.createElement('div');
    actionRow.className = 'control-group actions';
    actionRow.append(btn, langDiv);
    this.root.appendChild(actionRow);

    // 7) Geometria-visszaállítás — csak váznál, és csak ha tényleg van húzás.
    // A gomb tiltott állapota önmagában is jelzi, hogy nincs mit visszavonni.
    if (current?.frame) {
      const reset = document.createElement('button');
      reset.id = 'reset-geometry-btn';
      reset.className = 'secondary';
      reset.textContent = t('controls.resetGeometry');
      reset.disabled = !current.geometryEdited;
      reset.title = current.geometryEdited
        ? t('controls.resetGeometry')
        : t('controls.resetGeometryNone');
      reset.addEventListener('click', () => this.cb.onResetGeometry());
      this.root.appendChild(reset);
    }
  }

  private select(
    id: string,
    label: string,
    options: ModelOption[],
    onChange: (v: string) => void,
  ): HTMLDivElement {
    const div = document.createElement('div');
    div.className = 'control-group';
    const lab = document.createElement('label');
    lab.htmlFor = id;
    lab.textContent = label;
    const sel = document.createElement('select');
    sel.id = id;
    for (const opt of options) {
      const o = document.createElement('option');
      o.value = opt.id;
      o.textContent = opt.label;
      sel.appendChild(o);
    }
    sel.addEventListener('change', () => onChange(sel.value));
    div.append(lab, sel);
    return div;
  }

  private slider(
    id: string,
    label: string,
    min: number,
    max: number,
    step: number,
    value: number,
    fmt: (v: number) => string,
    onInput: (v: number) => void,
  ): HTMLDivElement {
    const div = document.createElement('div');
    div.className = 'control-group';
    const head = document.createElement('div');
    head.className = 'field-head';
    const lab = document.createElement('label');
    lab.htmlFor = id;
    lab.textContent = label;
    const val = document.createElement('span');
    val.className = 'field-val';
    const input = document.createElement('input');
    input.type = 'range';
    input.id = id;
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(value);
    const update = (v: number) => {
      val.textContent = fmt(v);
      const pct = ((v - min) / (max - min)) * 100;
      input.style.setProperty('--fill', `${pct}%`);
    };
    update(value);
    input.addEventListener('input', () => {
      const v = Number(input.value);
      update(v);
      onInput(v);
    });
    head.append(lab, val);
    div.append(head, input);
    return div;
  }
}
