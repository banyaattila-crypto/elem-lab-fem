# ElemLab

**An interactive Finite Element Method (FEM) playground — in your browser, no server required.**

> "See how the finite element method works — on your phone, without a server."

*Magyar változat: [README.md](README.md)*

ElemLab is an educational 2D finite element simulator: pick a model (cantilever beam,
truss bridge, plate with a hole), tweak sliders — load, material, mesh density — and
watch the Von Mises stress heatmap and deformed shape update in real time. The entire
solver is written in TypeScript and runs **client-side**: no backend, no uploads.

## Highlights

- 🔧 **Hand-written FEM core** — zero math dependencies:
  CSR sparse matrix, Jacobi-preconditioned **Conjugate Gradient** solver,
  constant strain triangle (CST) elements, DOF-elimination boundary conditions
- 📐 **Full derivations, live**: click any **element** to see its complete derivation
  step by step — nodal coordinates, areal coordinates *b/c*, area, **D**, **B**, the
  6×6 element stiffness matrix **kₑ = tA·BᵀDB**, displacements, strain ε = B·u,
  stress σ = D·ε and Von Mises — typeset with KaTeX, using the *actual* numbers from
  the running simulation
- 📍 **Node inspection**: click any **node** to see its displacement, applied load and
  the reaction force at supports
- 🏗️ **Three models**: cantilever beam, Warren truss bridge, plate with a hole
- 🎨 Colorblind-friendly **viridis** heatmap + deformed shape (Canvas 2D)
- 🌐 Hungarian / English · 📱 installable **PWA**, works offline
- ✅ **20/20 validation tests** against analytic solutions (Vitest)

## Quick start

```bash
npm install
npm run dev        # dev server
npm test           # 20 validation tests
npm run build      # production build + service worker
```

## Validation

The solver is checked against closed-form results:

| Test | Reference | Check |
|---|---|---|
| Cantilever tip deflection | δ = PL³ / 3EI | FEM/analytic ∈ (0.6, 1.05) |
| Plate-with-hole peak stress | Kt → 3σ₀ | plausibility band (staircase-boundary singularity) |
| Global force equilibrium | ΣR + ΣF = 0 | exact to 1e-6 N |
| CG solver | exact linear systems | < 1e-10 relative residual |
| CSR assembly | dense reference | element-wise match |

## Math notes

Full derivation (in Hungarian, with formulas): **[docs/fem-spec.md](docs/fem-spec.md)**

- Element stiffness: kₑ = t·A·Bᵀ·D·B (plane stress)
- Global system K·u = f solved by DOF elimination + preconditioned Conjugate Gradient
- Reactions: R = K·u − f evaluated on restrained DOFs

## Tech

Vite · TypeScript (strict) · vanilla DOM · Canvas 2D · KaTeX · Vitest · vite-plugin-pwa

## Status & roadmap

🟢 Working MVP, deployed. Next: circular-hole mesh (accurate Kt ≈ 3), deformation
animation, WebGL renderer, quadratic (T6) elements.

⚠️ *Educational demo — not for engineering decision-making!*

---

Built with 🤖 [Codebuff](https://codebuff.com)
