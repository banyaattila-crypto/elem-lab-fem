# ElemLab

**An interactive Finite Element Method (FEM) playground — in your browser, no server required.**

> "See how the finite element method works — on your phone, without a server."

*Magyar változat: [README.md](README.md)*

🌐 **Live demo:** [elem-lab-fem.vercel.app](https://elem-lab-fem.vercel.app)

ElemLab is an educational 2D finite element simulator: pick one of **7 models**
(beams, portal frame, corbel bracket, truss bridge, plate), tweak the controls —
load, load type (point ⇄ distributed), material, mesh density — and watch the
Von Mises stress heatmap and deformed shape update in real time. The entire
solver is written in TypeScript and runs **client-side**: no backend, no uploads.
The footer always shows which version and build you are looking at
(`v0.12.0 · build …`).

## Highlights

- 🔧 **Hand-written FEM core** — zero math dependencies:
  CSR sparse matrix, Jacobi-preconditioned **Conjugate Gradient** solver,
  constant strain triangle (CST) **and quadratic T6** elements (isoparametric,
  3-point Gauss quadrature), DOF-elimination boundary conditions,
  roller supports (single-DOF restraints) and distributed loads (N/m segments)
- 📐 **Full derivations, live**: click any **element** to see its complete derivation
  step by step — nodal coordinates, areal coordinates *b/c*, area, **D**, **B**, the
  6×6 element stiffness matrix **kₑ = tA·BᵀDB**, displacements, strain ε = B·u,
  stress σ = D·ε and Von Mises — typeset with KaTeX, using the *actual* numbers from
  the running simulation. (CST mode; in T6 mode it evaluates the corner triangle —
  see *Known limitations*)
- 📍 **Node inspection**: click any **node** to see its displacement, applied load and
  the reaction force at supports
- 📏 **Drawing annotations**: dimension lines (length, height, hole Ø),
  **support symbols** (fixed / pin / roller), **load arrows** (point loads with
  values, distributed load arrow series with q = … N/m), material and
  cross-section info panel
- 🔄 **Load-type switch**: point load ⇄ distributed load on beam models —
  both handled as real FEM loads with tested global equilibrium (ΣR = q·L)
- 📈 **M/V panel with cursor readout**: bending-moment and shear-force diagrams on a dedicated canvas below the view — hover to read x, M(x) and V(x) values (beam models)
- 🖱️ **Zoom/pan** in the 2D view (wheel = zoom at cursor, drag = pan,
  double-click = reset), plus a WebGL (Three.js) 3D view with orbit controls
- 🏗️ **Seven models**: cantilever, simply supported beam, fixed–fixed beam,
  portal frame, corbel bracket, Warren truss bridge, plate with a hole
- 🎨 Colorblind-friendly **single-hue blue** heatmap (Oklab interpolation, monotone
  lightness) + deformed shape (Canvas 2D + WebGL)
- 📚 **Lesson cards** per model · 🌐 Hungarian / English · 📱 installable **PWA**
- 📊 **Reaction values** next to the support symbols (R = … kN/N)
- ✅ **62/62 validation tests** against analytic solutions (Vitest)

## Quick start

```bash
npm install
npm run dev        # dev server
npm test           # 62 validation tests
npm run typecheck  # TypeScript checks
npm run build      # production build + service worker
```

## Validation

The solver is checked against closed-form results:

| Test | Reference | Check |
|---|---|---|
| Cantilever tip deflection | δ = PL³ / 3EI | FEM/analytic ∈ (0.6, 1.05) |
| Simply supported beam | δ = 5qL⁴/384EI · PL³/48EI | ±30% band (CST) |
| Fixed–fixed beam | δ = PL³/384EI + 5× ratio | ±30% band |
| M/V diagrams | V = dM/dx; M: qL²/8, PL/4, P·(L−x) | ±35% band (CST) |
| Plate-with-hole peak stress | Kt → 3σ₀ | plausibility band |
| Global force equilibrium | ΣR = −P | exact to 1e-6 N |
| Roller support | restrains only its DOF | Rₓ = 0 check |
| T6 element | rigid-body modes, patch test | exact |
| CG solver | exact linear systems | < 1e-10 relative residual |

## Math notes

Full derivation (in Hungarian, with formulas): **[docs/fem-spec.md](docs/fem-spec.md)**

- Element stiffness: kₑ = t·A·Bᵀ·D·B (CST, plane stress); kₑ = t·Σ w·detJ·Bᵀ·D·B (T6)
- Global system K·u = f solved by DOF elimination + preconditioned Conjugate Gradient
- Reactions: R = K·u − f evaluated on restrained DOFs
- Distributed loads: segment force q·L shared consistently over the nodes it covers

## Known limitations

Honest list of what is **not** finished:

| Limitation | Details |
|---|---|
| **The plate-with-hole Kt does not converge to 3** | the measured $K_t$ *grows* with mesh density (4.1 → 5.0). A structured grid alone is not enough — a boundary-fitted (Delaunay / advancing front) generator is required |
| **T6 stress is a Gauss-point average** | the element inspection shows the weighted average of the 3 Gauss points, not a value per point — the heatmap needs one value per element. B is not constant on a quadratic element either, so $\mathbf{\overline{B}}$ is a weighted average for which $\boldsymbol{\varepsilon}=\mathbf{\overline{B}}\mathbf{u}_e$ holds exactly |
| **No 1D bar element** | every model is a 2D triangle mesh; the truss bridge is a CST mesh, not a bar-element assembly |
| **Distributed loads are horizontal, y-direction only** | the segment force q·L is shared consistently over the nodes it covers; it preserves the resultant, not the true stress field |
| **T6 does not fix the stress concentration** | it does not solve the Kt problem, it does reduce the required mesh density |
| **No accounts, cloud save or sharing** | the PWA works offline but persists nothing |

## Tech

Vite · TypeScript (strict) · vanilla DOM · Canvas 2D + Three.js (WebGL) ·
KaTeX · Vitest · vite-plugin-pwa

## Status & roadmap

🟢 **v0.12.0 live**: cinematic "experience studio" design — 7 models, annotations + reaction values, M/V panel with cursor
readout, distributed loads, T6 + WebGL 3D view, MathPanel/NodePanel — 73/73 tests,
deployed on Vercel.
Next: boundary-fitted mesh for an accurate Kt ≈ 3 (currently 4.1 → 5.0 with
density), 1D bar elements for mixed models, geometry editor, portfolio page.

⚠️ *Educational demo — not for engineering decision-making!*

---

Built with 🤖 [Codebuff](https://codebuff.com)
