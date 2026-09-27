# ElemLab

**Interaktív végeselem-módszer (FEM) játszótér — böngészőben, szerver nélkül.**

> „Lásd meg, hogyan működik a végeselem-módszer — telefonon is, szerver nélkül."

🌐 **Élő demó:** [elem-lab-fem.vercel.app](https://elem-lab-fem.vercel.app)

Az ElemLab oktatási célú 2D végeselemes szimulátor: kész modelleket variálhatsz
csúszkákkal (terhelés, terhelés-típus, anyag, hálósűrűség), és valós időben látod
a feszültségmezőt színes hőtérképen, deformált geometriával. A teljes számítási
motor TypeScriptben, közvetlenül a böngészőben fut — nincs háttérszerver.
A láblécben mindig látod, melyik verziót és buildet nézed (`v0.10.0 · build …`).

## Funkciók

- 🔧 **Saját FEM-mag** — nulla külső függőség a számításban:
  CSR ritka mátrix, Jacobi-előkondicionált **Conjugate Gradient** szolver
- 📐 **CST elem** (konstans feszültségű háromszög) és **T6 kvadratikus elem**
  (izoparaméteres, 3 pontos Gauss-kvadratúrával)
- 🏗️ **7 kész modell** — gerendák, keret, tartó, rácsos híd, lemez (lásd lent)
- 🎨 **Egyárnyalatú kék hőtérkép** (Oklab-interpoláció, monoton világosság,
  színvakság-barát) + deformált alak — Canvas 2D **és**
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
- 🧮 **Valós idejű elem- és csomópontvizsgálat**: kattintásra teljes levezetés
  KaTeX-képletekkel, élő számokkal — geometria, D, B, kₑ, uₑ, ε, σ, Von Mises
  (CST módban; T6-ban a sarok-csúcsok adataival dolgozik — lásd a Korlátok részt)
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
npm test           # 62 validációs teszt
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

A szolvert ismert analitikus megoldásokkal ellenőrizzük (Vitest, **62 teszt**):

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
├── models/     # hálógenerátorok + 7 modell (gerendák, keret, tartó, híd, lemez)
├── viz/        # renderer, színtérkép (colormap.ts), picking, annotációk, M/V diagramok
├── ui/         # vezérlőpanel, MathPanel/NodePanel, leckék, i18n
└── locales/    # hu.json, en.json
tests/          # validációs és egységtesztek (62)
docs/           # matematikai specifikáció + UI vázlat
```

## Korlátok

Őszintén, hogy mi nincs kész — ezek a dokumentum előnye a marketing-(copy)-hoz képest:

| Korlát | Részletek |
|---|---|
| **A lyukas lemez Kt-je nem konvergál 3-hoz** | a mért $K_t$ a hálósűrűséggel **nő** (4,1 → 5,0). A konform rácsos háló önmagában nem elég; határkövető (Delaunay / advancing front) generátor kell |
| **A T6 feszültsége Gauss-átlag** | az elemvizsgálatban a 3 Gauss-pont súlyozott átlaga látható, nem külön pontonkénti érték — a hőtérkép elemenként egy értéket kér. A $\mathbf{B}$ sem állandó a kvadratikus elemen, ezért $\mathbf{\overline{B}}$ súlyozott átlag, amellyel $\boldsymbol{\varepsilon}=\mathbf{\overline{B}}\mathbf{u}_e$ pontosan teljesül |
| **Nincs 1D rúdelem** | minden modell 2D háromszögháló; a rácsos híd is CST-háló, nem rúdélemes |
| **Az elosztott terhelés csak vízszintes, $y$ irányú** | a szakasz teljes ereje ($q \cdot L$) konzisztensen megoszlik a rá eső csomópontok között; a valódi feszültségmező helyett az eredőerőt tartja meg |
| **A T6 koncentrációja** | a Kt-problémát a T6 nem oldja meg, a hálósűrűséget igen |
| **Nincs fiók, felhő-mentés, megosztás** | a PWA offline működik, de nincs perzisztencia |

## Technológia

Vite · TypeScript (strict) · vanilla DOM · Canvas 2D + Three.js (WebGL) ·
KaTeX · Vitest · vite-plugin-pwa

## Állapot és tervek

🟢 **v0.10.0 élő**: világos, szellős redesign — 7 modell, annotációk + reakció-feliratok, M/V panel kurzorral,
elosztott terhelés, T6 + WebGL 3D nézet, MathPanel/NodePanel — 73/73 teszt, Vercel deploy.
Tervek: határkövető háló a pontos Kt-hoz (a Kt jelenleg 4,1 → 5,0 a sűrűséggel),
1D rúdelem vegyes modellekhez, saját geometriaszerkesztő, portfólióoldal.

⚠️ *Oktatási célú bemutató — mérnöki döntésre nem használható!*

---

Készült 🤖 [Codebuff](https://codebuff.com)-mal
