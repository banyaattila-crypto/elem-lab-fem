# ElemLab — Státuszjelentés

> **Projekt:** Interaktív, oktatási célú végeselem-módszer (FEM) játszótér — web-first PWA
> **Utolsó frissítés:** 2026-09-27 · **v0.13.1** (verzió + build-ID a látható láblécben)
> **Státusz:** 🟢 Élő: **7 modell**, **CST + T6 elem**, Canvas 2D + WebGL (Three.js) 3D nézet, támasz/terhelés-séma annotáció, elosztott terhelés, M/V panel kurzor-kiolvasással, MathPanel + NodePanel, HU/EN, PWA, **73/73 teszt**, build OK, **Vercel deploy élő** (elem-lab-fem.vercel.app)

---

## 1. Projekt áttekintés

### 1.1 Vízió

Az ElemLab egy böngészőben (és telepíthető PWA-ként mobilon) futó interaktív alkalmazás,
amely a **végeselem-módszert (FEM / EEM)** teszi láthatóvá és kézzelfoghatóvá.
A felhasználó kész 2D modelleket variál csúszkákkal (terhelés, anyag, hálósűrűség),
és **valós időben** látja a feszültségmezőt színes hőtérképen, deformált geometriával.

**Differenciáló üzenet:**
> „Lásd meg, hogyan működik a végeselem-módszer — telefonon is, szerver nélkül."

### 1.2 Célcsoport és pozicionálás

| Szempont | Döntés |
|---|---|
| **Célcsoport** | Egyetemi/középiskolai hallgatók, tanárok, mérnökinformatikusok |
| **Piaci rés** | Az egyetemi FEM-oktatás nagy része elmélet + Matlab; nincs szép, mobilos, magyar nyelvű, interaktív eszköz |
| **Fő versenytársak** | SimScale (ipari, felhő), Ansys/Abaqus/COMSOL (drága, asztali), FEAScript (JS-könyvtár, nincs oktatási UI) |
| **Piacméret** | FEA-szoftverpiac ≈ 7,6–9 Mrd USD (2026), évi 7–13% növekedéssel — *piackutatási becslés, nincs elsődleges forrás megadva; a portfólió-követelményen nem múlik* |
| **Monetizáció (későbbi)** | Freemium: alap szimulációk ingyen; Pro/iskolai licencek |

### 1.3 Projektjellemzők

- **Típus:** Hobi / tanulási projekt + portfólió
- **Fókusz:** gyors, látványos, matematikailag hiteles eredmény
- **Nyelvek:** magyar (alapértelmezett) + angol (i18n)

---

## 2. Technológiai döntések

| Terület | Választott technológia | Indoklás |
|---|---|---|
| Build eszköz | **Vite** | Gyors dev-loop, minimális konfiguráció |
| Nyelv | **TypeScript** | Típusbiztos matematikai kód, jobb refaktorálás |
| UI-keretrendszer | **Nincs (vanilla TS + DOM)** | Tanulási cél: a motor a lényeg, nem a framework |
| FEM-mag | **Saját, TypeScriptben** | A solver megírása maga a tanulási élmény; böngészőben fut, szerver nélkül |
| Elem-típus | **2D háromszög: CST (3 csomópont) + T6 (6 csomópont, kvadratikus)** | Mindkettő a magban, váltóval azonos geometrián; a T6 adja a kvadratikus konvergenciát (hajlítási hiba 13,1% → 3,6%). Nincs külön 1D rúdelem — a rácsos híd is CST-háló |
| Vizualizáció | **Canvas 2D** (2D nézet) + **Three.js / WebGL** (3D nézet, OrbitControls) | 2D: egyszerű, függőség nélküli, gyors; 3D: térbeli szemléltetés. Váltó a canvason, WebGL-hibánál automatikus 2D-esés |
| Lineáris algebra | Saját ritka mátrix + **Conjugate Gradient** szolver | Tanulási érték; ha szűk lesz: `numeric.js`-típusú lib vagy wasm |
| Képlet-renderelés | **KaTeX** (`katex@0.18`) | A MathPanel/NodePanel levezetéseit TeX-ből generálja |
| PWA | Vite PWA plugin (manifest + service worker) | Telepíthető mobilon, offline működés |
| Tesztelés | **Vitest** | Vite-natív; analitikus validációs tesztek a solverhoz |
| Hosting | **Vercel** (Git-alapú CI/CD, ingyenes Hobby) + GitHub repo | `vercel.json` rögzíti: vite framework, `npm run build`, `dist` kimenet |

### 2.1 Kapcsolódó meglévő projektek

- `~/PrimFEM` — korábbi, **Python-alapú** FEM-könyvtár (elkülönül, nem épül be; ötletforrásként szolgálhat)

---

## 3. Projektstruktúra (valós állapot)

```
elemlab/
├── STATUS_REPORT.md          ← ez a fájl
├── README.md / README.en.md  ← repo leírás (GitHub, két nyelven)
├── vercel.json               ← Vercel deploy konfiguráció
├── vite.config.ts            ← Vite + PWA plugin + verzió/build-ID injektálás
├── tsconfig.json / package.json
├── docs/
│   ├── fem-spec.md           ← EEM-mag matematikai specifikáció (képletekkel) — lásd a T6-ra vonatkozó megjegyzést
│   └── ui-vazlat.html        ← UI vázlat, böngészőben megnyitható
├── index.html
├── public/
│   ├── manifest.webmanifest  ← PWA manifest
│   └── icons/                ← PWA ikonok (icon.svg, icon-maskable.svg)
├── src/
│   ├── main.ts               ← app állapot, modell-választó, kattintáskezelés, 2D/3D + CST/T6 váltó
│   ├── style.css
│   ├── version.ts            ← verzió + build-ID (Vite define-ből), window.ELEMLAB
│   ├── fem/                  ← a számító mag (tisztán tesztelhető)
│   │   ├── types.ts          ← Mesh, Node, Element, BC, megoldási típusok
│   │   ├── linalg.ts         ← CSR ritka mátrix, Jacobi-előkondicionált CG
│   │   ├── cst.ts            ← konstans feszültségű háromszögelem
│   │   ├── t6.ts             ← kvadratikus T6 elem, 3-pontos Gauss-kvadratúra
│   │   ├── assemble.ts       ← globális merevségi mátrix összeállítás (CST + T6)
│   │   └── solve.ts          ← megoldás DOF-eliminációval, reakcióerőkkel
│   ├── models/               ← előre definiált modellek
│   │   ├── meshgen.ts        ← rács-hálógenerátor + anyagkatalógus
│   │   ├── t6convert.ts      ← CST→T6 konverzió él-hashinggel
│   │   ├── cantilever.ts     ← konzolgerenda (+ analitikus hajlás)
│   │   ├── simplySupported.ts← egyszerűen tartott gerenda (+ M/V analitika)
│   │   ├── fixedFixed.ts     ← kétvégén befogott gerenda
│   │   ├── portalFrame.ts    ← portálkeret (csomópont-összeillesztett szalagháló)
│   │   ├── corbel.ts         ← konzolos tartó (L-alak)
│   │   ├── trussBridge.ts    ← rácsos híd
│   │   └── plateWithHole.ts  ← lyukas lemez (+ Kt referencia)
│   ├── viz/                  ← vizualizáció
│   │   ├── renderer.ts       ← Canvas 2D: hőtérkép, deformáció, animáció, jelmagyarázat
│   │   ├── webgl-renderer.ts ← Three.js 3D nézet, csúcs-színes mező, OrbitControls
│   │   ├── annotate.ts       ← méretvonalak, támasz-/terhelés-szimbólumok, reakció-feliratok
│   │   ├── diagrams.ts       ← M/V panel (két aldiagram, kurzor-kiolvasó doboz)
│   │   ├── colormap.ts       ← viridis színtérkép
│   │   └── picking.ts        ← elem-kiválasztás (screen→world)
│   ├── ui/
│   │   ├── controls.ts       ← csúszkák, választók, terhelés-típus váltó
│   │   ├── mathpanel.ts      ← elemvizsgálat számítása
│   │   ├── mathpanel-view.ts ← KaTeX levezetés-renderelés
│   │   ├── nodepanel.ts      ← csomópontvizsgálat (elmozdulás, terhelés, reakció)
│   │   ├── nodepanel-view.ts ← csomópont-panel nézete
│   │   ├── lessons.ts        ← lecke-kártyák
│   │   └── i18n.ts           ← nyelvkezelés
│   └── locales/
│       ├── hu.json
│       └── en.json
└── tests/                    ← 73 teszt, 8 fájl
    ├── linalg.test.ts        ← 6  · CSR + CG egységtesztek
    ├── fem.test.ts           ← 9  · analitikus validáció (hajlás, Kt, Von Mises)
    ├── newmodels.test.ts     ← 17 · új modellek, reakciók, M/V analitika
    ├── t6.test.ts            ← 8  · T6 merevtest, patch-teszt, hajlási konvergencia
    ├── mathpanel.test.ts      ← 10 · MathPanel T6/CST levezetés, ε=B̄uₑ és σ=Dε azonosság
    ├── colormap.test.ts       ← 11 · színtérkép: monoton világosság, simaság, egyárnyalat, tartomány
    ├── node.test.ts          ← 7  · csomópont-egyensúly (ΣR + ΣF = 0)
    └── picking.test.ts       ← 5  · kiválasztás + transzformáció
```

---

## 4. MVP-hatáskör

### 4.1 Az első verzióba kerül

- [x] Saját 2D FEM-mag: **CST + T6** elem, saját Jacobi-előkondicionált CG-szolver, reakcióerő-számítás
- [x] **7 kész modell**: konzolgerenda, egyszerűen tartott gerenda, kétvégén befogott gerenda, portálkeret, konzolos tartó (L-alak), rácsos híd, lyukas lemez
- [x] Támasztípusok: befogás, csukló, görgő (rollerX/rollerY); terheléstípusok: pontterhelés, elosztott terhelés (N/m) — **pont ⇄ elosztott váltó** a vezérlőpanelen
- [x] Rajz-annotáció: méretvonalak, támasz-szimbólumok, reakció-feliratok, terhelés-nyilak, anyag/keresztmetszet infópanel, statikai séma sor
- [x] Csúszkák: terhelő erő, anyag (acél / alumínium / fa), hálósűrűség (1–5), deformáció-arány
- [x] Von Mises hőtérkép + deformált alak, **deformáció-animáció** (▶/⏸, 1,6 s-os sin²-lengetés)
- [x] **2D (Canvas) és 3D (WebGL/Three.js) nézet** váltóval, csúcs-színes folytonos mezővel és OrbitControls-szal
- [x] **CST ⇄ T6 kapcsoló** a canvason (azonos geometria, két elemtípus összehasonlítása)
- [x] **M/V diagramok** külön, nagy felbontású panelen (M felül, V alul, kitöltött görbeterülettel, kurzor-kiolvasó doboz)
- [x] Lecke-kártyák (modellenként 1 magyarázó kártya)
- [x] HU/EN nyelvváltás
- [x] PWA: manifest + service worker (build OK), verzió + build-ID a láblécben
- [x] **Valós idejű elemvizsgálat (MathPanel)**: kattintásra teljes levezetés KaTeX képletekkel, élő adatokkal, elemnavigációval (◀ ▶), canvas-kiemeléssel — **CST és T6 elemtípusban egyaránt** (T6-nál természetes koordináták, Gauss-pontok, súlyozott B-átlag, 12×12 kₑ)
- [x] **Valós idejű csomópontvizsgálat (NodePanel)**: elmozdulás, terhelés, reakcióerő (R = K·u − f), erőegyensúly-levezetés
- [x] Analitikus validációs tesztek (Vitest) — **73/73 zöld** (8 fájl)

### 4.2 Szándékosan későbbre tolva

- 3D-s (térfogati) elemek (Hexa-típusú elemcsalád)
- **Határkövető háló generálása** (Delaunay / advancing front) a pontos Kt≈3 érdekében — a körre-projekciós kísérlet 2026-09-26-án kudarchoz vezetett, lásd a naplóban
- **1D rúdelem** a magban (külön rúdrács-modellekhez, pl. hagyományos rácsos szerkezetekhez) — a rácsos híd jelenleg CST-háló
- Saját geometriaszerkesztő / STL-import
- Fiókok, felhő-mentés, megosztás
- Portfólióoldal (a Fázis 4 maradéka)

---

## 5. Mérföldkövek és ütemterv

| Fázis | Tartalom | Becslés | Státusz |
|---|---|---|---|
| 0 | Projektváz: Vite + TS + PWA keret | 1 nap | 🟢 kész |
| 1 | FEM-mag (CST) + validációs tesztek | 1–2 hét | 🟢 kész (15/15 teszt akkor, ma 73/73; build OK) |
| 2 | UI, csúszkák, hőtérkép, MathPanel, mobil touch-polish | 1–2 hét | 🟢 kész (MathPanel + KaTeX + 44px érintési célok) |
| 3 | Leckék, i18n, mobil polish | 1 hét | 🟢 kész (leckék, HU/EN, touch-action/overscroll) |
| 4 | Deploy + portfólióoldal | 1–2 nap | 🟡 GitHub repo (publikus) + Vercel deploy kész; **portfólióoldal pending** |
| 5 | T6 kvadratikus elem, WebGL/3D nézet, M/V panelek (v0.2.0–v0.7.0) | +1 hét | 🟢 kész |

> A Fázis 5 a határesetvétel utáni bővítés: a 2026-09-26-i kereklyuk-kísérlet kudarcát
> a T6 bevezetése és a határkövető háló későbbre tolása követte.

---

## 6. Matematikai / fizikai alapok (röviden)

A teljes, képletekkel ellátott specifikáció: **[docs/fem-spec.md](docs/fem-spec.md)**

> ⚠️ A specifikáció a **CST** elemre készült (2026-09-26.); a T6 kvadratikus elem
> később került a magba, a `docs/fem-spec.md` T6-fejezete még hiányzik. A jelenlegi
> képletek: `src/fem/t6.ts` (Gauss-pontok, alakfüggvények, J⁻¹ láncszabály, B/D).

- Módszer: elmozdulás-alapú FEM, lineáris rugalmasságtan, **síkfeszültség-állapot**, egységnyi vastagság helyett modellenként megadott t (gerendák 20 mm, rácsos híd 10 mm, lemez 5 mm)
- Elem: 3 csomópontú háromszög lineáris elmozdulástérrel (CST, konstans feszültség), illetve opcionálisan 6 csomópontú kvadratikus háromszög (T6, 3-pontos Gauss-kvadratúra)
- Egyensúly: **K·u = f** globális egyenletrendszer; megoldás Jacobi-előkondicionált Conjugate Gradient módszerrel, DOF-eliminációval
- Reakcióerők: **R = K·u − f** a rögzített csomópontokon (a kiegyensúlyozatlan erőmaradék)
- Kiértékelés: elemenkénti feszültség → Von Mises jellemző → hőtérkép
- Validáció: analitikus képletekkel (hajlítás, Kt, M/V = dM/dx, reakció-egyensúly ΣR = −F) — 73 teszt

---

## 7. Kockázatok és nyitott kérdések

| # | Kockázat / kérdés | Kezelés |
|---|---|---|
| 1 | Nagy hálónál (sűrűség-csúszka 5) lassulhat a TS-szolver | Hálósűrűség-felső korlát (1–5); később wasm-motor |
| 2 | A numerikus stabilitás (kondíciószám) ronthatja a pontosságot | Analitikus tesztek + relatív hiba küszöb a CI-ban |
| 3 | Színtér diszlexiabarát diszkrimináció | ColorBrewer/viridis-szerű paletta, színvakság-barát |
| 4 | ~~Nyitott: PWA-plugin / service worker stratégia~~ | **Lezárva:** vite-plugin-pwa 0.21, generateSW, autoUpdate |
| 5 | ~~Nyitott: repo név / hosting~~ | **Lezárva:** `elem-lab-fem` (**publikus** repo) + Vercel deploy |
| 6 | **CST hajlítási hibája 13,1%** a konzolgerenda analitikushoz képest | A T6 elem ezt 3,6%-ra javítja; a canvason kapcsoló van CST ⇄ T6 között, azonos geometrián. A README a pontosságot sávokkal (CST ±35%) dokumentálja |
| 7 | **Lyukas lemez Kt-je 4,1 → 5,0 a sűrűséggel nő**, a pontos Kt≈3 nem érhető el konform rácsos hálóval | Nyitott: határkövető (Delaunay / advancing-front) hálógenerátor. A körre-projekciós kísérlet 2026-09-26-án szilánk-elemeket és üres foltokat adott → **visszavonva** |
| 8 | WebGL / GPU hiánya WebView-környezetben | `try/catch` a renderer előkészítésénél + indítási hiba-banner: az app 2D-ben is fut tovább |
| 9 | `docs/fem-spec.md` a T6 elem kifejlesztése előtti állapotot dokumentálja | Nyitott: T6-fejezet a specifikációba (forrás: `src/fem/t6.ts`) |

---

## 8. Napló (döntések, változások)

| Dátum | Esemény / döntés |
|---|---|
| 2026-09-26 | Projekt ötlet + piackutatás; irányválasztás: **oktatási FEM-playground** |
| 2026-09-26 | Döntések: **web-first PWA**, **Vite + TypeScript**, saját solver, Canvas 2D, Vitest |
| 2026-09-26 | `elemlab/` mappa létrehozva, **git repo inicializálva** (`main` branch) |
| 2026-09-26 | `STATUS_REPORT.md` létrehozva (ez a dokumentum) |
| 2026-09-26 | Projektváz: Vite + TS + PWA fájlok, npm install, typecheck zöld |
| 2026-09-26 | FEM-mag implementálva: CSR ritka mátrix, Jacobi-előkondicionált CG, CST elem, assembly, DOF-eliminációs peremfeltétel |
| 2026-09-26 | 3 modell elkészítve (konzolgerenda, rácsos híd, lyukas lemez) + Canvas 2D renderer (viridis) + UI + i18n |
| 2026-09-26 | **15/15 validációs teszt zöld**; `npm run build` OK (20,75 kB JS, 7,9 kB gzip) |
| 2026-09-26 | `docs/fem-spec.md` — EEM-mag matematikai specifikáció (LaTeX képletekkel) |
| 2026-09-26 | `docs/ui-vazlat.html` — UI-vázlat (statikus mockup) |
| 2026-09-26 | README hozzáadva; **GitHub repo létrehozva és feltöltve**: `banyaattila-crypto/elem-lab-fem` (privát) |
| 2026-09-26 | Vercel bekötve (vercel.json: vite framework, dist kimenet); füstteszt OK (HTTP 200) |
| 2026-09-26 | **Valós idejű elemvizsgálat (MathPanel)**: kattintásra egy elem teljes CST-levezetése KaTeX képletekkel, élő számokkal — geometria, b/c csúszóintek, A, D, B, kₑ, uₑ, ε, σ, Von Mises; elemnavigáció ◀ ▶; kiemelés a canvason; picking tiszta modullal + 5 új teszt (20/20 zöld) |
| 2026-09-26 | STATUS_REPORT.md átfogó frissítése: struktúra a valósághoz igazítva, hosting → Vercel, mérföldkövek és kockázatok aktualizálva |
| 2026-09-26 | **Csomópont-vizsgálat (NodePanel)**: elmozdulás, terhelés, reakcióerő (R = K·u − f), környező elemek, erőegyensúly-levezetés; reakció-számítás a szolverben; kattintásban a csomópont elsőbbséget élvez; 7 új fizikai teszt (ΣR + ΣF = 0) → **27/27 zöld** |
| 2026-09-26 | **Mobil polish**: 44px érintési célok, kompakt panelek, képlet-skálázás kis kijelzőn |
| 2026-09-26 | **Repo publikus**: titok-szken tiszta, README.en.md, leírás + 8 topic (fem, education, …) — portfólióra kész |
| 2026-09-26 | **Deformáció-animáció**: ▶/⏸ gomb a canvason, 1,6 s sin²-lengetés a deformálatlan és deformált alak között (requestAnimationFrame, aria-pressed, nyelvfüggetlen felirat) |
| 2026-09-26 | **Kerek lyuk kísérlet — visszavonva**: körre-projekció + CCW-javítás szilánk-elemeket adott, a mért Kt 4,1→5,0 romlott a sűrűséggel (mérőteszttel igazolva); a Laplace-simítás bent maradt elemek nélkül üres foltokat hagyott. Tanulság: a pontos Kt≈3 valódi határkövető hálót (Delaunay/advancing-front) igényel — visszatérünk rá a T6 elemekkel együtt |
| 2026-09-26 | **Mobil végigteszt**: touch-action manipulation (nincs 300 ms késleltetés), tap-highlight ki, overscroll-behavior; 27/27 teszt, build + füstteszt (HTTP 200) OK |
| 2026-09-27 | **T6 kvadratikus elem a magban**: izoparaméteres 6 csomópontú háromszög (t6.ts), 3 pontos Gauss-kvadratúra (súlyok 1/6 — referencia-terület ½!), 12×12 merevség; láncszabály (J⁻¹)ᵀ-alakban; CST→T6 konverzió él-hashinggel, rögzített élek közép-csomópontjai rögzítve; 8 új teszt (merevtest, patch-teszt, hajlás) → **35/35 zöld** |
| 2026-09-27 | T6 validáció: konzolgerenda hajlásarány az analitikushoz **CST 0,869 → T6 1,036** (13,1% → 3,6% hiba) — a kvadratikus elem a vártnak megfelelően 3,5×-szer pontosabb |
| 2026-09-27 | **WebGL renderer (Three.js)**: csúcs-színes folytonos hőtérkép (környező elemek VM-átlaga), OrbitControls (forgatás/zoom/pan), T6-nál 4 gyerek-háromszög felbontás; 2D/3D váltó + CST⇄T6 kapcsoló a canvason |
| 2026-09-27 | **v0.2.0 — Nézet-javítások**: a rajz mindkét tengelyen középre igazítva (a befoglaló a maximálisan deformált alakot is figyelembe veszi); KaTeX-képlet-javítás (a TeX-et már nem escape-eljük → nincs több „&amp;”-szöveg); görgős zoom (mutató körül) + húzásos pan + dupla kattintás = visszaállítás a 2D nézetben; canvas-jelmagyarázat (Viridis sáv, 0/max VM, deformáció-arány) |
| 2026-09-27 | **v0.2.0 — WebView-független indítás**: WebGL-előkészítés try/catch-ben (GPU/WebView hiányában az app fut tovább 2D-ben), indítási hiba-banner (látható üzenet üres vászon helyett), verzió + build-ID a láblécben/konzolban/DevTools-ban (window.ELEMLAB), cleanupOutdatedCaches |
| 2026-09-27 | **v0.3.0 — Rajz-annotáció + új modellek**: méretvonalak (hossz, magasság, lyuk-Ø) nyilakkal; infópanel (modell, anyag, E, ν, keresztmetszet); görgő-támasz a FEM-magban (rollerX/rollerY); 3 új modell: egyszerűen tartott gerenda (csukló + görgő), portálkeret (csomópont-összeillesztett szalagháló), kétlyukú lemez; 10 új fizikai teszt (45/45) |
| 2026-09-27 | **v0.4.0 — Támasz-szimbólumok, terhelés-sémák, elosztott terhelés**: befogás/csukló/görgő ikonok a valós geometrián; pontterhelés-nyíl értékkel + elosztott terhelés sorozat-nyilakkal (q = … N/m) a canvason; **elosztott terhelés a FEM-magban** (bc.distributed, N/m szakaszok); statikai séma sor az infópanelen; 2 új modell: kétvégén befogott gerenda (5× hajlás-arány validálva) + konzolos tartó (L-alak, falba befogva); 8 modell összesen; leckék minden új modellhez; **52/52 teszt** |
| 2026-09-27 | **v0.5.0 — Terhelés-váltó + M/V diagramok**: pontterhelés ⇄ elosztott váltó a vezérlőpanelen (gerenda-modelleknél; a konzolgerenda pont-, az egyszerűen tartott elosztott alapbeállítással indul; az analitikus képletek típusfüggően váltanak); hajlítási feszültség- és nyíróerő-profil (M/V) a canvas alatti sávban a gerenda-modelleknél; README.hu + README.en teljes frissítése (8 modell, T6/WebGL, 52 teszt, demó-link) |
| 2026-09-27 | **v0.6.0 — Reakció-értékek a sémában + M/V analitikus validáció + kétlyukú lemez eltávolítva**: támasz-szimbólumok mellett zöld R = … kN/N feliratok (a legközelebbi csomópont reakcióiból); M/V tesztek analitikus gerenda-összefüggésekre (Δσ = M/W és V = dM/dx; egyszerű tartás: M-csúcs középen + V(L/4), konzol: M = P·(L−x) + V állandó); a V-kiszámítás átállt a zajos elemszintű τ-integrálról a dM/dx deriváltra; kétlyukú lemez modell + lecke + tesztek kivéve (7 modell); **51/51 teszt** |
| 2026-09-27 | **v0.7.0 — M/V panel kurzorral**: a diagramok kiköltöztek a fő canvasonból egy külön, nagy felbontású panelre (devicePixelRatio-tudatos); M most már kN·m-ben (M = Δσ·W); két al-diagram (M felül, V alul), kitöltött görbeterülettel; egér-kurzor: függőleges vonal + pötty a görbéken + kiolvasó doboz (x, M(x), V(x)); új teszt: egyszerű tartás + középi pontterhelés (M(L/2) = PL/4·W, V ugrás ±P/2 előjelváltással); **52/52 teszt** |
| 2026-09-27 | **STATUS_REPORT.md konzisztencia-javítás (kódváltozás nélkül)**: a fejléc, az MVP-lista és a mérföldkövek a valós állapothoz igazítva — **8 → 7 modell** (a kétlyukú lemez v0.6.0-ban kivéve), a T6 és a WebGL/Three.js kikerült a „későbbre tolva" listából (mindkettő kész), a 3. fejezet struktúrája a tényleges fájlokra frissült (52 teszt, 6 fájl; 11 korábban nem listázott forrásfájl), a technológiai táblázatból kivettük a nem létező 1D rúdelemet és bekerült a KaTeX; 4 új kockázatsor (CST 13,1% hajlítási hiba, Kt≈3 határkövető háló, WebView/WebGL esés, elavult fem-spec); 3. fázis lezárva. **Ellenőrzve:** `npx vitest run` 52/52, `package.json` 0.7.0, `src/models/` = 7 modell |
| 2026-09-27 | **Dokumentáció-szinkron (kódváltozás nélkül)**: `docs/fem-spec.md` → V1.1 (új 4. fejezet: T6 csúcssorrend, alakfüggvények, 3 pontos Gauss-kvadratúra, Jacobian-láncszabály, 12×12 merevség, Gauss-átlagos feszültség, CST→T6 él-hashing; új 5.3 szakasz-terhelés és 7.2 reakcióerők; a 9. fejezet korlát-táblázata 7 sorra bővült); `README.md` + `README.en.md` → 7 modell, 52 teszt, v0.7.0, új **Korlátok / Known limitations** szakasz. Talált hibák: (1) a T6 **nem** alapértelmezett elem, a `state.elementType` CST-ről indul — a korábbi „alapértelmezett T6" állítás mindkét fájlban hamis volt, javítva; (2) **MathPanel T6 módban csak a sarok-háromszögre számol CST-képletekkel** (`mathpanel.ts → inspectElement()` a `nodes[0..2]`-t olvassa, az élközépcsúcsokat figyelmen kívül hagyja) → a README korlátok közé került, kódmódosítás nem történt |
| 2026-09-27 | **MathPanel T6-támogatás (a korábbi sarok-háromszög-hiba javítva)**: az `inspectElement()` felismeri a háló elemtípusát, és T6-nál a teljes kvadratikus elem adataival számol — 6 csúcs, természetes koordináták, 3 Gauss-pont `(L₁,L₂)`/`w`/`detJ` táblázat, súlyozott B-átlag `B̄ = Σ(w·detJ·B)/Σ(w·detJ)`, 12×12 `kₑ = t·Σ(w·detJ·BᵀDB)`, 12 elmozdulás, Gauss-átlagos ε és σ. A nézet (`mathpanel-view.ts`) típusfüggő: ugyanaz a 8 szekció, T6-nál a kvadratikus elemre jellemző képletekkel; a 12×12-es mátrix a meglévő `.katex-display` overflow-on görget. Új: elemtípus-címke a panel fejlécében, `.mp-table` stílus. **Új tesztfájl `tests/mathpanel.test.ts` (10 teszt)**: a mutatott `kₑ` és `σ` megegyezik a szolver `t6Stiffness`/`t6Stress` eredményével, `ε = B̄·uₑ` és `σ = D·ε` pontosan, `Σw·detJ = A`, a középcsúcsok valóban élfelezők, CST-regresszió nincs, a nézet HU/EN nyelven NaN nélkül renderel. **Regresszióellenőrzés:** a régi hibás ággal szimulálva 7/10 teszt elbukik, a fixxel mind zöld. **62/62 teszt**, typecheck és build OK. A README-korlátokból a MathPanel-sor kivéve, helyére a Gauss-átlag korlát került (HU + EN). |
| 2026-09-27 | **Feszültség-térkép: egyárnyalatú kék, Oklab-interpolációval** (a „szivárvány" kérés): a korábbi 5 pontos viridis-törpe helyett 9 kontrollpontos **sötétkék → világoskék** skála (#0a1830 → #c6e5f4), amelyet **Oklab-színtérben** interpolálunk, így a színátmenet egyenletes (nincs fényerő-ingadozás a lépcsők között, nincs banding). Egyetlen árnyalat, monoton világossággal: a szín kizárólag a feszültséget hordozza, a sötét alkalmazói háttéren (#0f172a) a gyenge feszültség visszavonódik, a csúcs kiemelkedik. **A skála most egyetlen forrásból szolgál ki mindhárom nézetnek** — a WebGL rendererben eddig duplikált, külön beégetett kontrolpontok megszűntek, helyettük a közös `colormap.ts` (a duplikáció volt a drift kockázata). A Canvas-legenda 60 lépés, a HTML-legenda korábbi 10 stoppja helyett **64 stoppos** gradiens (a 10 stoppos sRGB-interpoláció sávkódást adott). **Talált és javított hiba:** az első implementációban a `srgbToLinear()` 0–1 helyett 0–255 inputet kapott → az egész skála fehérre csapott; az Oklab-visszafordítás klipszelt. **Új tesztfájl `tests/colormap.test.ts` (11 teszt)**: végpontok, `b ≥ g ≥ r` minden mintán (nincs szivárvány), monoton világosság, legnagyobb szomszédos L-lépés < 0,01 és < 3× az átlag, szomszédos színek távolsága < 12, tartomány/NaN-kezelés, 64 stoppos legenda-gradiens. **Regresszióellenőrzés:** a 0–255/0–1 hibával szimulálva 5/11 teszt elbukik, a fixxel mind zöld. A `docs/fem-spec.md` 7.4 szakasz és a `docs/ui-vazlat.html` mockup is az új skálára átírva. **73/73 teszt**, typecheck és build OK. |
| 2026-09-27 | **v0.9.0 — Részletek-fülek + légtő**: a jobb oszlop alsó blokkjai (Lecke, Eredmények, Elem-/Csomópontvizsgálat) külön fülre kerültek; a canvas és az M/V diagram mindig látható marad, a Lecke az alapértelmezett fül; elem- vagy csomópont-választáskor a nézet automatikusan a Vizsgálat fülre vált; az M/V panel a jobb felső gombbal összecsukható (▲/▼); szellősebb elrendezés: nagyobb `gap`, max-szélesség 1280 px, karcsúsított fejléc, a canvas minimál-magassága 360 px-ra nőtt; a fülek és a fel/le gomb feliratai HU/EN-követőek. **73/73 teszt**, typecheck és build OK. |
| 2026-09-27 | **v0.9.1 — Kompakt vezérlők + nagyobb rajzablak**: a bal sáv keskenyebb (280 → 232 px), a vezérlőelemek tömörebbek (gap/padding/betű csökkentve), a „Számítás indítása" és a HU/EN nyelvváltó egyetlen sorba került; a rajz-canvas magasabb: minimál 400 px, maximum 640 px, 0,70 képarány (a szélesebb ablakon nagyobb rajz). **73/73 teszt**, typecheck és build OK. |
| 2026-09-27 | **v0.10.0 — Teljes redesign: világos, szellős, kártyás**: sötét → világos paletta (`--bg #0f172a → #eef2f7`, fehér kártyák, sötétszürke szöveg, `--accent #2563eb`). Minden blokk (sidebar, canvas-wrap, lecke/eredmények/mathpanel, M/V) fehér kártya finom árnyékkal + 16 px radius; ragadós, blur-fejléc; tágasabb layout (max 1360 px, nagyobb gap). A canvas-render réteg világosra színezve: Canvas 2D + WebGL háttér `#f4f7fb`, sötét hálóvonalak, a rajz-annotációk (méretvonalak, támaszok, erő-nyilak, reakció-feliratok) sötét/erősebb színekre váltva (piros `#ef4444`, narancs `#ea580c`, zöld `#16a34a`); az infópanel és a canvas-jelmagyarázat világos háttér + sötét felirat; M/V diagram sötét bordó (`#d97706`) és sötét kék (`#0284c7`) görbék, fehér kiolvasó doboz; `theme-color` + PWA manifest is világos. A hanggombok, fülek, legendák „üveg" hatású, áttetsző fehérek sötét szöveggel. **73/73 teszt**, typecheck és build OK. |
| 2026-09-27 | **v0.11.0 — Vizuális újraépítés („oktatási stúdió" hangulat)**: márkázott fejléc — színátmenetes logó-tábla (kék→lila), gradiens címszöveg, verziópilula a sarokban; a háttér sima szín helyett lágy színátmenetes radíál-gradiensek (kék/lila/égszínkék foltok) rögzített csatolással; ragadós oldalsáv (görgetéskor is látható vezérlők); a csúszkák egyediek: érték-kimutató pilula a fejléc jobb oldalán (pl. „1 kN", „×500"), a sáv a beállított értékig kitöltött gradiens + fehér fogantyú; a legördülők nyíl-ikonnal és nagyobb, félkövér, hover/fókusz-ring-gel; a fő gombok gradiens (kék→indigó) árnyékkal, a másodlagosak (HU/EN, elem-nav) hoverre gradiensre váltanak; a fülek szegmentált vezérlővé alakultak (radiál-tábla helyett aktív pill + árnyék); az eredmény-kártyák színes bal széllel (kék/lila/borostyán/zöld) a négy mérőszám szerint; a jelmagyarázat középre igazított üveg-pilula lett, az engine-váltó (2D/3D/CST) és az animációs gomb üveg-pillula; a legend-def érték kiemelt pilula; a Gauss-táblázat és a KaTeX-formulák lágy zebra-hátteret kaptak; saját görgetősáv, `theme-color` + manifest szinkron; félkövér tipográfia (700) a címkéknél/gomboknál, nagyobb `min-height` a táblázat-celláknál. A Canvas 2D/WebGL háttér az előző verzió világos igényeit örökli (`#f4f7fb`). **73/73 teszt**, typecheck és build OK. |
| 2026-09-27 | **v0.13.1 — Vigyél színt a fehérbe (világos téma gazdagítása)**: a „puritán fehér" ellen — (1) **élettel teli oldalháttér** — három, észrevehetően erősebb radiális színfolt (kék/fiola/celesztin, 13–17% fedés) + diagonális kék–lila átmenet (#e4edfc → #eef2ff → #f3ecfe), így a lap kék-lila „műhely" lesz; (2) **erősebb auróra** — telítettebb foltok, nagyobb fedés (55%); a kártyák már nem izzó fehérek, hanem **lágy kék gradiens-kártyák** (fehér → #eef4ff, kék tükrű éllel) a lecke/eredmények/mathpanel/M-V/canvas-wrap/sidebar elemeknél; (3) **színes eredmény-kártyák** — minden mérőszám a saját színének áttetsző háttérfényébe és élkartonjába kerül (égszínkék/lila/borostyán/zöld, `color-mix` él), a `result-item` címkék ugyanebben a színben; (4) **vászon** — a Canvas 2D háttere a fehér helyett diagonális kék→lila átmenet, erősebb pontrács (60% fedés, sötétebb kék pontok), két színű ragyogás (kék középpont → lila szélek); a háló-élek és T6-kötéspontok mélyebb kékek; a WebGL háttér is kék-lila (`#e8eefc`); (5) **gradiensek** — a fő gombok kék→lila→mályva irányba telítődnek, a márkafelirat színátmenete a végén egy rózsaszín csattanót kap; (6) a méretvonalak/támaszok/infópanel mélyebb mérnöki kék színt kaptak, az M/V panel háttere világos kék. A sötét téma változatlan (azzal nem volt baj). **73/73 teszt**, typecheck és build OK. |
