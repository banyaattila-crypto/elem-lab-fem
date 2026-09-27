/**
 * M/V diagramok gerenda-modellekhez.
 * A FEM-megoldásból (elemi feszültségekből) visszafejtett belső erők:
 *  - Hajlítási feszültség-profil: a felső szál σx feszültsége a gerenda
 *    tengelye mentén — M(x) = σ_top(x)·W alakban egyenesen a nyomaték.
 *  - Nyíróerő V(x): a keresztmetszeten átvitt nyíróerő, a τxy értékekből
 *    (V ≈ ∫τ·t dy ≈ τ·t·H közelítés a CST konstans elemeken).
 *
 * Oktatási célú közelítés: a profil a deformálatlan gerenda tengelye
 * mentén értendő, elemenkénti konstans értékekkel (CST).
 */

import type { Mesh, SolutionResult } from '../fem/types';

/** Egy x-helyhez tartozó diagram-érték */
export interface DiagramSample {
  /** x [világ egység] */
  x: number;
  /** felső szál σx [Pa] — M-mel arányos */
  sigmaTop: number;
  /** nyíróerő V [N] */
  shear: number;
}

/**
 * Diagram-mintavételezés: az elemek súlypontja szerint rendezve.
 * Ugyanazon x-re eső elemek értékei átlagolódnak.
 */
export function sampleDiagrams(
  mesh: Mesh,
  sol: SolutionResult,
): DiagramSample[] {
  // Gerenda-tengely: y-közép és x-tartomány a befoglalóból
  let minX = Infinity;
  let maxX = -Infinity;
  let sumY = 0;
  for (const n of mesh.nodes) {
    if (n.x < minX) minX = n.x;
    if (n.x > maxX) maxX = n.x;
    sumY += n.y;
  }
  const midY = sumY / mesh.nodes.length;
  const H = Math.max(...mesh.nodes.map((n) => n.y)) - Math.min(...mesh.nodes.map((n) => n.y));

  // elemenkénti értékek a súlypont x-éhez, FELSŐ és ALSÓ elem-sávra bontva
  // (a hajlítási szélsőfeszültség a felső és alsó szál σx különbségéből adódik:
  //  Δσ = σ_top − σ_bot = M·(c_top + c_bot)/I → M-mel arányos)
  interface Acc { topSum: number; topN: number; botSum: number; botN: number }
  const buckets = new Map<number, Acc>();
  for (const elem of mesh.elements) {
    const pts = elem.nodes.slice(0, 3).map((nid) => mesh.nodes[nid]!);
    const gx = (pts[0]!.x + pts[1]!.x + pts[2]!.x) / 3;
    const gy = (pts[0]!.y + pts[1]!.y + pts[2]!.y) / 3;
    if (Math.abs(gy - midY) > H / 2 + 1e-9) continue;

    const s = sol.stresses.get(elem.id);
    if (!s) continue;

    const band = gy > midY ? 'top' : 'bot';
    const key = Math.round(gx * 1000) / 1000;
    const b = buckets.get(key) ?? { topSum: 0, topN: 0, botSum: 0, botN: 0 };
    if (band === 'top') {
      b.topSum += s.sigmaX;
      b.topN += 1;
    } else {
      b.botSum += s.sigmaX;
      b.botN += 1;
    }
    buckets.set(key, b);
  }

  // Első lépés: a hajlítási szélsőfeszültség-profil (Δσ = σ_top − σ_bot)
  const samples: DiagramSample[] = [];
  const keys = [...buckets.keys()].sort((a, b) => a - b);
  for (const k of keys) {
    const b = buckets.get(k)!;
    const top = b.topN > 0 ? b.topSum / b.topN : 0;
    const bot = b.botN > 0 ? b.botSum / b.botN : 0;
    samples.push({ x: k, sigmaTop: top - bot, shear: 0 });
  }

  // Második lépés: V(x) = dM/dx, ahol M = Δσ·I/(H/2) — a nyíróerő a
  // nyomaték-profil deriváltja (a klasszikus gerenda-összefüggés).
  const I = (mesh.thickness * H * H * H) / 12;
  for (let i = 0; i < samples.length; i++) {
    const iPrev = Math.max(0, i - 1);
    const iNext = Math.min(samples.length - 1, i + 1);
    const dx = samples[iNext]!.x - samples[iPrev]!.x;
    if (dx < 1e-12) continue;
    const mPrev = samples[iPrev]!.sigmaTop * (I / (H / 2));
    const mNext = samples[iNext]!.sigmaTop * (I / (H / 2));
    samples[i]!.shear = (mNext - mPrev) / dx;
  }
  return samples;
}

/** Erő/feszültség rövid formázó a diagram-tengelyekhez */
function fmtVal(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e6) return `${(v / 1e6).toFixed(1)} MPa`;
  if (a >= 1e3) return `${(v / 1e3).toFixed(1)} kPa`;
  return `${v.toFixed(0)} Pa`;
}

/**
 * Diagramok kirajzolása a vászon ALJÁN lévő sávba (a gerenda alatt):
 *  - felső sáv: hajlítási feszültség-profil (M-mel arányos)
 *  - alsó sáv: nyíróerő V(x)
 * A sáv a canvas alsó ~38%-án van, ha a mesh-nek van elég x-terjedelme.
 */
export function drawDiagrams(
  ctx: CanvasRenderingContext2D,
  mesh: Mesh,
  sol: SolutionResult,
  worldToScreen: (x: number, y: number) => { sx: number; sy: number },
): void {
  const samples = sampleDiagrams(mesh, sol);
  if (samples.length < 2) return;

  const { height } = ctx.canvas;
  const bandTop = height * 0.6;
  const bandH = (height - bandTop) / 2;

  // skálák
  let maxS = 0;
  let maxV = 0;
  for (const s of samples) {
    maxS = Math.max(maxS, Math.abs(s.sigmaTop));
    maxV = Math.max(maxV, Math.abs(s.shear));
  }
  if (maxS < 1e-12 && maxV < 1e-12) return;
  maxS = Math.max(maxS, 1e-9);
  maxV = Math.max(maxV, 1e-9);

  // X-tartomány képernyőn
  const sx0 = worldToScreen(samples[0]!.x, 0).sx;
  const sx1 = worldToScreen(samples[samples.length - 1]!.x, 0).sx;

  ctx.save();
  ctx.font = '10px system-ui, sans-serif';
  ctx.textBaseline = 'top';

  // ————— 1) Hajlítási feszültség (M-profil) —————
  const mMid = bandTop + bandH / 2;
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.4)';
  ctx.beginPath();
  ctx.moveTo(sx0, mMid);
  ctx.lineTo(sx1, mMid);
  ctx.stroke();

  ctx.strokeStyle = '#fbbf24';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  samples.forEach((s, i) => {
    const px = worldToScreen(s.x, 0).sx;
    const py = mMid - (s.sigmaTop / maxS) * (bandH * 0.42);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.stroke();

  ctx.fillStyle = '#fbbf24';
  ctx.textAlign = 'left';
  ctx.fillText('σ forgás (M-profil)', sx0, bandTop + 2);
  ctx.textAlign = 'right';
  ctx.fillText(`±${fmtVal(maxS)}`, sx1, bandTop + 2);

  // ————— 2) Nyíróerő V —————
  const vMid = bandTop + bandH * 1.5;
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.4)';
  ctx.beginPath();
  ctx.moveTo(sx0, vMid);
  ctx.lineTo(sx1, vMid);
  ctx.stroke();

  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  samples.forEach((s, i) => {
    const px = worldToScreen(s.x, 0).sx;
    const py = vMid - (s.shear / maxV) * (bandH * 0.42);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.stroke();

  ctx.fillStyle = '#38bdf8';
  ctx.textAlign = 'left';
  ctx.fillText('V nyíróerő', sx0, bandTop + bandH + 2);
  ctx.textAlign = 'right';
  ctx.fillText(`±${fmtVal(maxV)}`, sx1, bandTop + bandH + 2);

  ctx.restore();
}
