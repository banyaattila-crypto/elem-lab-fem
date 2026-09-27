# ElemLab

**Interaktív végeselem-módszer (FEM) játszótér — böngészőben, szerver nélkül.**

> „Lásd meg, hogyan működik a végeselem-módszer — telefonon is, szerver nélkül."

🌐 **Élő demó:** [elem-lab-fem.vercel.app](https://elem-lab-fem.vercel.app)

Az ElemLab oktatási célú 2D végeselemes szimulátor: kész modelleket variálhatsz
csúszkákkal (terhelés, terhelés-típus, anyag, hálósűrűség), és valós időben látod
a feszültségmezőt színes hőtérképen, deformált geometriával. A teljes számítási
motor TypeScriptben, közvetlenül a böngészőben fut — nincs háttérszerver.
A láblécben mindig látod, melyik verziót és buildet nézed (`v0.5.0 · build …`).

## Funkciók

- 🔧 **Saját FEM-mag** — nulla külső függőség a számításban:
  CSR ritka mátrix, Jacobi-előkondicionált **Conjugate Gradient** szolver
- 📐 **CST elem** (konstans feszültségű háromszög) és **T6 kvadratikus elem**
  (izoparaméteres, 3 pontos Gauss-kvadratúrával)
- 🏗️ **7 kész modell** — gerendák, keret, tartó, rácsos híd, lemez (lásd lent)
- 🎨 **Viridis hőtérkép** (színvakság-barát) + deformált alak — Canvas 2D **és**
  WebGL (Three.js, csúcs-színes folytonos mező, forgatás/zoom/pan)
- 📏 **Rajz-annotációk**: méretvonalak (hossz, magasság, lyuk-Ø),
  **támasz-szimbólumok** (befogás / csukló / görgő), **terhelés-nyilak**
  (pontterhelés + elosztott terhelés sémája), anyag- és keresztmetszet-infópanel
- 🔄 **Terhelés-típus váltó**: pontterhelés ⇄ elosztott terhelés (N/m) a
  gerenda-modelleknél — mindkettő valódi FEM-terhelésként van kezelve
- 📈 **M/V panel kurzorral**: hajlítónyomaték- és nyíróerő-diagram a vászon
  alatti saját panelen — vidd az egeret fölé, és kiolvashatod az x, M(x), V(x)
  értékeket (gerenda-modelleknél)
- 🖱️ **Zoom/pan** a 2D nézetben (görgő = zoom az egér körül, húzás = mozgatás,
  dupla kattintás = visszaállítás)
- 🧮 **Valós idejű elem- és csomópontvizsgálat**: kattintásra teljes CST-levezetés
  KaTeX-képletekkel, élő számokkal — geometria, D, B, kₑ, uₑ, ε, σ, Von Mises
- 📚 **Lecke-kártyák** — modellenként magyarázat, mit és miért látsz
- 🌐 **Magyar / angol** nyelv
- 📱 **PWA** — telepíthető, offline működő

## Modellek

| Modell | Statika | Mit tanít |
|---|---|---|
| **Konzolgerenda** | befogás + P vagy q | hajlítónyomaték-eloszlás, δ = PL³/3EI |
| **Egyszerűen tartott gerenda** | csukló + görgő | M-csúcs középen, görgő szerepe |
| **Kétvégén befogott gerenda** | 2× befogás | miért 5× merevebb, mint az egyszerűen tartott |
| **Portálkeret** | 2× befogás, merev sarkok | nyomaték-átfordulás a sarokcsomókban |
| **Konzolos tartó** | falba befogott L-alak | hajlítás + nyírás kombinációja |
| **Rácsos híd (Warren)** | 2 támasz | öv-húzás/nyomás, átlós nyírás |
| **Lyukas lemez** | húzás σ₀ | feszültségkoncentráció, Kt ≈ 3 |

## Gyorsindítás

```bash
npm install
npm run dev        # fejlesztői szerver
npm test           # 51 validációs teszt
npm run typecheck  # TypeScript ellenőrzés
npm run build      # produkciós build + service worker
```

## Matematikai háttér

A teljes specifikáció képletekkel: **[docs/fem-spec.md](docs/fem-spec.md)**

Röviden:

- Egyensúly: $\mathbf{K}\mathbf{u} = \mathbf{f}$, ahol $\mathbf{k}_e = t\,A\,\mathbf{B}^\top \mathbf{D}\,\mathbf{B}$
- Anyagmátrix síkfeszültségre: $\mathbf{D} = \frac{E}{1-\nu^2}\begin{bmatrix}1 & \nu & 0\\ \nu & 1 & 0\\ 0 & 0 & \frac{1-\nu}{2}\end{bmatrix}$
- Von Mises: $\sigma_{vM} = \sqrt{\sigma_x^2 + \sigma_y^2 - \sigma_x\sigma_y + 3\tau_{xy}^2}$
- Peremfeltételek: DOF-elimináció → $\mathbf{K}_{ff}\mathbf{u}_f = \mathbf{f}_f$ (SPD → CG konvergál)
- Elosztott terhelés: a szakasz teljes erője (q·L) a rá eső csomópontok között
  konzisztensen megosztva → reakció-egyensúly (ΣR = q·L) tesztelve

## Validáció

A szolvert ismert analitikus megoldásokkal ellenőrizzük (Vitest, **51 teszt**):

| Teszt | Referencia | Ellenőrzés |
|---|---|---|
| Konzolgerenda hajlása | $\delta = \frac{PL^3}{3EI}$ | FEM/analitikus ∈ (0.6, 1.05) |
| Egyszerűen tartott gerenda | $\delta = \frac{5qL^4}{384EI}$ / $\frac{PL^3}{48EI}$ | ±30% sáv (CST) |
| Kétvégén befogott gerenda | $\delta = \frac{PL^3}{384EI}$ + 5× arány | ±30% sáv |
| M/V diagramok | V = dM/dx; M: qL²/8, PL/4, P·(L−x) | ±35% sáv (CST) |
| Lyukas lemez csúcsfeszültség | $K_t \to 3\sigma_0$ | plauzibilitási sáv |
| Reakció-egyensúly minden modellen | ΣR = −P | numerikus nulla |
| Görgő-támasz | csak adott DOF rögzít | Rₓ = 0 ellenőrzés |
| T6 elem | merevtest-mozgás, patch-teszt, hajlás | egzakt |
| CG szolver | egzakt lineáris rendszerek | 1e-10 tolerancia alatt |

## Projektstruktúra

```
src/
├── fem/        # számító mag: típusok, CSR+CG, CST + T6 elem, assembly, solve
├── models/     # hálógenerátorok + 8 modell (gerendák, keret, tartó, lemezek)
├── viz/        # renderer, viridis, picking, annotációk, M/V diagramok
├── ui/         # vezérlőpanel, MathPanel/NodePanel, leckék, i18n
└── locales/    # hu.json, en.json
tests/          # validációs és egységtesztek (52)
docs/           # matematikai specifikáció + UI vázlat
```

## Technológia

Vite · TypeScript (strict) · vanilla DOM · Canvas 2D + Three.js (WebGL) ·
KaTeX · Vitest · vite-plugin-pwa

## Állapot és tervek

🟢 **v0.5.0 élő**: 8 modell, annotációk, M/V diagramok, elosztott terhelés,
T6 + WebGL, MathPanel/NodePanel — 52/52 teszt, Vercel deploy.
Tervek: határkövető háló a pontos Kt-hoz, rúd-elemek vegyes modellekhez,
saját geometriaszerkesztő.

⚠️ *Oktatási célú bemutató — mérnöki döntésre nem használható!*

---

Készült 🤖 [Codebuff](https://codebuff.com)-mal
