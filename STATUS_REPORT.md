# ElemLab — Státuszjelentés

> **Projekt:** Interaktív, oktatási célú végeselem-módszer (FEM) játszótér — web-first PWA
> **Utolsó frissítés:** 2026-09-27 · **v0.7.0** (verzió + build-ID a látható láblécben)
> **Státusz:** 🟢 Élő: 8 modell, támasz/terhelés-séma annotáció, elosztott terhelés, MathPanel + NodePanel, **52/52 teszt**, build OK, **Vercel deploy élő** (elem-lab-fem.vercel.app)

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
| **Piacméret** | FEA-szoftverpiac ≈ 7,6–9 Mrd USD (2026), évi 7–13% növekedéssel |
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
| Elem-típus (MVP) | 1D rúdrács + 2D konstans feszültségű háromszög (CST) | Klasszikus, jól validálható, milliszekundumos futásidő |
| Vizualizáció | **Canvas 2D** (később opcionálisan WebGL/Three.js) | Elég a 2D hőtérképhez, egyszerű, függőség nélküli |
| Lineáris algebra | Saját ritka mátrix + **Conjugate Gradient** szolver | Tanulási érték; ha szűk lesz: `numeric.js`-típusú lib vagy wasm |
| PWA | Vite PWA plugin (manifest + service worker) | Telepíthető mobilon, offline működés |
| Tesztelés | **Vitest** | Vite-natív; analitikus validációs tesztek a solverhoz |
| Hosting | **Vercel** (Git-alapú CI/CD, ingyenes Hobby) + GitHub repo | `vercel.json` rögzíti: vite framework, `npm run build`, `dist` kimenet |

### 2.1 Kapcsolódó meglévő projektek

- `~/PrimFEM` — korábbi, **Python-alapú** FEM-könyvtár (elkülönül, nem épül be; ötletforrásként szolgálhat)

---

## 3. Projektstruktúra (tervezett)

```
elemlab/
├── STATUS_REPORT.md          ← ez a fájl
├── README.md                 ← repo leírás (GitHub)
├── vercel.json               ← Vercel deploy konfiguráció
├── vite.config.ts            ← Vite + PWA plugin
├── tsconfig.json / package.json
├── docs/
│   ├── fem-spec.md           ← EEM-mag matematikai specifikáció (képletekkel)
│   └── ui-vazlat.html        ← UI vázlat, böngészőben megnyitható
├── index.html
├── public/
│   ├── manifest.webmanifest  ← PWA manifest
│   └── icons/                ← PWA ikonok (SVG)
├── src/
│   ├── main.ts               ← belépési pont + kattintáskezelés
│   ├── fem/                  ← a számító mag (tisztán tesztelhető)
│   │   ├── types.ts          ← Mesh, Node, Element, BC típusok
│   │   ├── linalg.ts         ← CSR ritka mátrix, Jacobi-előkondicionált CG
│   │   ├── cst.ts            ← konstans feszültségű háromszögelem
│   │   ├── assemble.ts       ← globális merevségi mátrix összeállítás
│   │   └── solve.ts          ← megoldás DOF-eliminációval
│   ├── models/               ← előre definiált modellek
│   │   ├── meshgen.ts        ← rács-hálógenerátor + anyagkatalógus
│   │   ├── cantilever.ts     ← konzolgerenda (+ analitikus hajlás)
│   │   ├── trussBridge.ts    ← rácsos híd
│   │   └── plateWithHole.ts  ← lyukas lemez (+ Kt referencia)
│   ├── viz/                  ← Canvas 2D vizualizáció
│   │   ├── renderer.ts       ← hőtérkép + deformáció + kijelölés-kiemelés
│   │   ├── colormap.ts       ← viridis színtérkép
│   │   └── picking.ts        ← elem-kiválasztás (screen→world)
│   ├── ui/
│   │   ├── mathpanel.ts      ← elemvizsgálat számítása + formázók
│   │   ├── mathpanel-view.ts ← KaTeX levezetés-renderelés
│   │   ├── controls.ts       ← csúszkák, választók
│   │   ├── lessons.ts        ← lecke-kártyák
│   │   └── i18n.ts           ← nyelvkezelés
│   └── locales/
│       ├── hu.json
│       └── en.json
└── tests/
    ├── linalg.test.ts        ← CSR + CG egységtesztek
    ├── fem.test.ts           ← analitikus validáció (hajlás, Kt, Von Mises)
    └── picking.test.ts       ← kiválasztás + transzformáció tesztek
```

---

## 4. MVP-hatáskör

### 4.1 Az első verzióba kerül

- [x] Saját 2D FEM-mag (CST + T6 elemek, saját CG-szolver)
- [x] **8 kész modell**: konzolgerenda, egyszerűen tartott gerenda, kétvégén befogott gerenda, portálkeret, konzolos tartó, rácsos híd, lyukas lemez, kétlyukú lemez
- [x] Támasztípusok: befogás, csukló, görgő (rollerX/rollerY); terheléstípusok: pontterhelés, elosztott terhelés (N/m)
- [x] Rajz-annotáció: méretvonalak, támasz-szimbólumok, terhelés-nyilak, anyag/keresztmetszet infópanel
- [x] Csúszkák: terhelő erő, anyag (acél / alumínium / fa), hálósűrűség
- [x] Von Mises hőtérkép + deformált alak (Canvas 2D) — animáció később
- [x] Lecke-kártyák (modellenként 1 magyarázó kártya)
- [x] HU/EN nyelvváltás
- [x] PWA: manifest + service worker (build OK)
- [x] **Valós idejű elemvizsgálat (MathPanel)**: kattintásra teljes CST-levezetés KaTeX képletekkel, élő adatokkal, elemnavigációval (◀ ▶), canvas-kiemeléssel
- [x] Analitikus validációs tesztek (Vitest) — 20/20 zöld

### 4.2 Szándékosan későbbre tolva

- 3D-s elemek, másodrendű elemek (T6)
- Saját geometriaszerkesztő / STL-import
- WebGL (Three.js) renderer
- Fiókok, felhő-mentés, megosztás

---

## 5. Mérföldkövek és ütemterv

| Fázis | Tartalom | Becslés | Státusz |
|---|---|---|---|
| 0 | Projektváz: Vite + TS + PWA keret | 1 nap | 🟢 kész |
| 1 | FEM-mag (CST) + validációs tesztek | 1–2 hét | 🟢 kész (15/15 teszt, build OK) |
| 2 | UI, csúszkák, hőtérkép, MathPanel | 1–2 hét | 🟢 kész (MathPanel + KaTeX; kis mobil-polish maradt) |
| 3 | Leckék, i18n, mobil polish | 1 hét | 🟡 leckék + i18n kész, mobil polish hátravan |
| 4 | Deploy + portfólióoldal | 1–2 nap | 🟢 GitHub repo + Vercel deploy kész; portfólióoldal pending |

---

## 6. Matematikai / fizikai alapok (röviden)

A teljes, képletekkel ellátott specifikáció: **[docs/fem-spec.md](docs/fem-spec.md)**

- Módszer: elmozdulás-alapú FEM, lineáris rugalmasságtan, síkfeszültség-állapot
- Elem: 3 csomópontú háromszög, lineáris elmozdulástér, konstans feszültség (CST)
- Egyensúly: **K·u = f** globális egyenletrendszer; megoldás Conjugate Gradient módszerrel
- Kiértékelés: elemenkénti feszültség → Von Mises jellemző → hőtérkép

---

## 7. Kockázatok és nyitott kérdések

| # | Kockázat / kérdés | Kezelés |
|---|---|---|
| 1 | Nagy hálónál (30k+ elem) lassulhat a TS-szolver | Hálósűrűség-felső korlát; később wasm-motor |
| 2 | A numerikus stabilitás ( kondíciószám ) ronthatja a pontosságot | Analitikus tesztek + relatív hiba küszöb a CI-ban |
| 3 | Színtér diszlexiabarát diszkrimináció | ColorBrewer/viridis-szerű paletta, színvakság-barát |
| 4 | ~~Nyitott: PWA-plugin / service worker stratégia~~ | **Lezárva:** vite-plugin-pwa 0.21, generateSW, autoUpdate |
| 5 | ~~Nyitott: repo név / hosting~~ | **Lezárva:** `elem-lab-fem` (privát) + Vercel deploy |

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
