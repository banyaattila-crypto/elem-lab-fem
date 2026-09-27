# ElemLab

**Interaktív végeselem-módszer (FEM) játszótér — böngészőben, szerver nélkül.**

> „Lásd meg, hogyan működik a végeselem-módszer — telefonon is, szerver nélkül."

Az ElemLab oktatási célú 2D végeselemes szimulátor: kész modelleket variálhatsz
csúszkákkal (terhelés, anyag, hálósűrűség), és valós időben látod a feszültségmezőt
színes hőtérképen, deformált geometriával. A teljes számítási motor TypeScriptben,
közvetlenül a böngészőben fut — nincs háttérszerver.

## Funkciók

- 🔧 **Saját FEM-mag** — nulla külső függőség a számításban:
  CSR ritka mátrix, Jacobi-előkondicionált **Conjugate Gradient** szolver
- 📐 **CST elem** (konstans feszültségű háromszög) — 6 szabadsági fok/elem
- 🏗️ **3 kész modell:** konzolgerenda, rácsos híd (Warren-tartó), lyukas lemez
- 🎨 **Viridis hőtérkép** (színvakság-barát) + deformált alak rajzolás Canvas 2D-n
- 📚 **Lecke-kártyák** — modellenként magyarázat, mit és miért látsz
- 🌐 **Magyar / angol** nyelv
- 📱 **PWA** — telepíthető, offline működő

## Gyorsindítás

```bash
npm install
npm run dev        # fejlesztői szerver
npm test           # 15 validációs teszt
npm run build      # produkciós build + service worker
```

## Matematikai háttér

A teljes specifikáció képletekkel: **[docs/fem-spec.md](docs/fem-spec.md)**

Röviden:

- Egyensúly: $\mathbf{K}\mathbf{u} = \mathbf{f}$, ahol $\mathbf{k}_e = t\,A\,\mathbf{B}^\top \mathbf{D}\,\mathbf{B}$
- Anyagmátrix síkfeszültségre: $\mathbf{D} = \frac{E}{1-\nu^2}\begin{bmatrix}1 & \nu & 0\\ \nu & 1 & 0\\ 0 & 0 & \frac{1-\nu}{2}\end{bmatrix}$
- Von Mises: $\sigma_{vM} = \sqrt{\sigma_x^2 + \sigma_y^2 - \sigma_x\sigma_y + 3\tau_{xy}^2}$
- Peremfeltételek: DOF-elimináció → $\mathbf{K}_{ff}\mathbf{u}_f = \mathbf{f}_f$ (SPD → CG konvergál)

## Validáció

A szolvert ismert analitikus megoldásokkal ellenőrizzük (Vitest):

| Teszt | Referencia | Ellenőrzés |
|---|---|---|
| Konzolgerenda hajlása | $\delta = \frac{PL^3}{3EI}$ | FEM/analitikus ∈ (0.6, 1.05) |
| Lyukas lemez csúcsfeszültség | $K_t \to 3\sigma_0$ | plauzibilitási sáv (lépcsős határ szingularitás) |
| CG szolver | egzakt lineáris rendszerek | 1e-10 tolerancia alatt |
| CSR assembly | kézi dense referencia | elemenkénti egyezés |

## Projektstruktúra

```
src/
├── fem/        # számító mag: típusok, CSR+CG, CST elem, assembly, solve
├── models/     # hálógenerátorok és a 3 kész modell
├── viz/        # viridis színtérkép + Canvas 2D renderer
├── ui/         # vezérlőpanel, leckék, i18n
└── locales/    # hu.json, en.json
tests/          # validációs és egységtesztek
docs/           # matematikai specifikáció + UI vázlat
```

## Technológia

Vite · TypeScript (strict) · vanilla DOM · Canvas 2D · Vitest · vite-plugin-pwa

## Állapot és tervek

🟢 MVP-mag működik és validált. Tervek: kerek lyuk-poligon (pontos Kt),
deformáció-animáció, WebGL renderer, további elemek (T6), publikus GitHub Pages deploy.

⚠️ *Oktatási célú bemutató — mérnöki döntésre nem használható!*

---

Készült 🤖 [Codebuff](https://codebuff.com)-mal
