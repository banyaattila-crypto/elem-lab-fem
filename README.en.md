# ElemLab

**An interactive Finite Element Method (FEM) playground — in your browser, no server required.**

> "See how the finite element method works — on your phone, without a server."

*Magyar változat: [README.md](README.md)*

🌐 **Live demo:** [elem-lab-fem.vercel.app](https://elem-lab-fem.vercel.app)

ElemLab is an educational 2D finite element simulator: pick one of **8 models**
(beams, portal frame, corbel bracket, truss bridge, plates), tweak the controls —
load, load type (point ⇄ distributed), material, mesh density — and watch the
Von Mises stress heatmap and deformed shape update in real time. The entire
solver is written in TypeScript and runs **client-side**: no backend, no uploads.
The footer always shows which version and build you are looking at
(`v0.5.0 · build …`).

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
  the running simulation
- 📍 **Node inspection**: click any **node** to see its displacement, applied load and
  the reaction force at supports
- 📏 **Drawing annotations**: dimension lines (length, height, hole Ø),
  **support symbols** (fixed / pin / roller), **load arrows** (point loads with
  values, distributed load arrow series with q = … N/m), material and
  cross-section info panel
- 🔄 **Load-type switch**: point load ⇄ distributed load on beam models —
  both handled as real FEM loads with tested global equilibrium (ΣR = q·L)
- 📈 **M/V diagrams**: bending-stress and shear-force profiles along the beam axis
- 🖱️ **Zoom/pan** in the 2D view (wheel = zoom at cursor, drag = pan,
  double-click = reset), plus a WebGL (Three.js) 3D view with orbit controls
- 🏗️ **Eight models**: cantilever, simply supported beam, fixed–fixed beam,
  portal frame, corbel bracket, Warren truss bridge, plate with a hole,
  plate with two holes
- 🎨 Colorblind-friendly **viridis** heatmap + deformed shape (Canvas 2D + WebGL)
- 📚 **Lesson cards** per model · 🌐 Hungarian / English · 📱 installable **PWA**
- ✅ **52/52 validation tests** against analytic solutions (Vitest)

## Quick start

```bash
npm install
npm run dev        # dev server
npm test           # 52 validation tests
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
| Plate-with-hole peak stress | Kt → 3σ₀ | plausibility band |
| Global force equilibrium | ΣR = −P | exact to 1e-6 N |
| Roller support | restrains only its DOF | Rₓ = 0 check |
| T6 element | rigid-body modes, patch test | exact |
| CG solver | exact linear systems | < 1e-10 relative residual |

## Math notes

Full derivation (in Hungarian, with formulas): **[docs/fem-spec.md](docs/fem-spec.md)**

- Element stiffness: kₑ = t·A·Bᵀ·D·B (plane stress)
- Global system K·u = f solved by DOF elimination + preconditioned Conjugate Gradient
- Reactions: R = K·u − f evaluated on restrained DOFs
- Distributed loads: segment force q·L shared consistently over the nodes it covers

## Tech

Vite · TypeScript (strict) · vanilla DOM · Canvas 2D + Three.js (WebGL) ·
KaTeX · Vitest · vite-plugin-pwa

## Status & roadmap

🟢 **v0.5.0 live**: 8 models, annotations, M/V diagrams, distributed loads,
T6 + WebGL, MathPanel/NodePanel — 52/52 tests, deployed on Vercel.
Next: boundary-fitted mesh for an accurate Kt ≈ 3, truss/bar elements for
mixed models, geometry editor.

⚠️ *Educational demo — not for engineering decision-making!*

---

Built with 🤖 [Codebuff](https://codebuff.com)
