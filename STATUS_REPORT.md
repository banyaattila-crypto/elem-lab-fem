# ElemLab — Státuszjelentés

> **Projekt:** Interaktív, oktatási célú végeselem-módszer (FEM) játszótér — web-first PWA
> **Utolsó frissítés:** 2026-09-26
> **Státusz:** 🟡 Tervezési fázis — projektváz + specifikációk készülnek

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
| Hosting | GitHub Pages | Ingyenes, portfólióbarát |

### 2.1 Kapcsolódó meglévő projektek

- `~/PrimFEM` — korábbi, **Python-alapú** FEM-könyvtár (elkülönül, nem épül be; ötletforrásként szolgálhat)

---

## 3. Projektstruktúra (tervezett)

```
elemlab/
├── STATUS_REPORT.md          ← ez a fájl
├── docs/
│   ├── fem-spec.md           ← EEM-mag matematikai specifikáció (képletekkel)
│   └── ui-vazlat.html        ← UI vázlat, böngészőben megnyitható
├── index.html
├── public/
│   ├── manifest.webmanifest  ← PWA manifest
│   └── icons/                ← PWA ikonok
├── src/
│   ├── main.ts               ← belépési pont
│   ├── fem/                  ← a számító mag (tisztán tesztelhető)
│   │   ├── types.ts          ← Mesh, Node, Element, BC típusok
│   │   ├── linalg.ts         ← ritka mátrix, CG-szolver
│   │   ├── cst.ts            ← konstans feszültségű háromszögelem
│   │   ├── assemble.ts       ← globális merevségi mátrix összeállítás
│   │   └── solve.ts          ← teljes megoldási pipeline
│   ├── models/               ← előre definiált modellek
│   │   ├── cantilever.ts     ← konzolgerenda
│   │   ├── trussBridge.ts    ← rácsos híd
│   │   └── plateWithHole.ts  ← lyukas lemez
│   ├── viz/                  ← Canvas 2D hőtérkép + deformáció-animáció
│   │   ├── renderer.ts
│   │   └── colormap.ts
│   ├── ui/                   ← csúszkák, leckék, i18n
│   │   ├── controls.ts
│   │   ├── lessons.ts
│   │   └── i18n.ts
│   └── locales/
│       ├── hu.json
│       └── en.json
└── tests/
    ├── linalg.test.ts
    └── cst.test.ts           ← analitikus validáció (pl. gerendahajlás)
```

---

## 4. MVP-hatáskör

### 4.1 Az első verzióba kerül

- [ ] Saját 2D FEM-mag (CST elemek, saját CG-szolver)
- [ ] 3 kész modell: **konzolgerenda**, **rácsos híd**, **lyukas lemez**
- [ ] Csúszkák: terhelő erő, anyag (acél / alumínium / fa), hálósűrűség
- [ ] Von Mises hőtérkép + deformált alak animáció (Canvas 2D)
- [ ] Lecke-kártyák (2–3 mondat modellenként: „Mit látsz? Miért ott a max feszültség?")
- [ ] HU/EN nyelvváltás
- [ ] PWA: telepíthető, offline működő
- [ ] Analitikus validációs tesztek (Vitest)

### 4.2 Szándékosan későbbre tolva

- 3D-s elemek, másodrendű elemek (T6)
- Saját geometriaszerkesztő / STL-import
- WebGL (Three.js) renderer
- Fiókok, felhő-mentés, megosztás

---

## 5. Mérföldkövek és ütemterv

| Fázis | Tartalom | Becslés | Státusz |
|---|---|---|---|
| 0 | Projektváz: Vite + TS + PWA keret | 1 nap | 🟡 folyamatban |
| 1 | FEM-mag (CST) + validációs tesztek | 1–2 hét | ⚪ nem kezdődött el |
| 2 | UI, csúszkák, hőtérkép-vizualizáció | 1–2 hét | ⚪ nem kezdődött el |
| 3 | Leckék, i18n, mobil polish | 1 hét | ⚪ nem kezdődött el |
| 4 | Deploy (GitHub Pages) + portfólióoldal | 1–2 nap | ⚪ nem kezdődött el |

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
| 4 | Nyitott: pontos PWA-plugin verzió / service worker stratégia | Fázis 0-ban döntés |
| 5 | Nyitott: GitHub Pages URL / repo neve | Deploy előtt döntés |

---

## 8. Napló (döntések, változások)

| Dátum | Esemény / döntés |
|---|---|
| 2026-09-26 | Projekt ötlet + piackutatás; irányválasztás: **oktatási FEM-playground** |
| 2026-09-26 | Döntések: **web-first PWA**, **Vite + TypeScript**, saját solver, Canvas 2D, Vitest |
| 2026-09-26 | `elemlab/` mappa létrehozva, **git repo inicializálva** (`main` branch) |
| 2026-09-26 | `STATUS_REPORT.md` létrehozva (ez a dokumentum) |
| 2026-09-26 | `docs/fem-spec.md` — EEM-mag matematikai specifikáció (LaTeX képletekkel) |
| 2026-09-26 | `docs/ui-vazlat.html` — interaktív UI-vázlat létrehozva |
