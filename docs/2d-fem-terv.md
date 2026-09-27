# ElemLab — 2D váz-modellező terv (rúd/keret/rácsos elemek)

> **Terv:** 0.1 · **Dátum:** 2026-09-27 · **Státusz:** jóváhagyásra vár
>
> Ez a dokumentum az ElemLab új fázisát írja le: az oktatási célú végeselemes
> játszótér **valódi interaktív 2D szerkezet-tervezővé** válik. A jelenlegi
> folytonos-közegi (CST/T6) megoldó mellé egy **1D rúd-elem mag** kerül, így
> gerenda, tört gerenda, keret és rácsos tartó **tiszta statikával** (N, M, V,
> reakciók) modellezhető és ellenőrizhető.
>
> A jelölés és a hangnem a `docs/fem-spec.md`-hez igazodik; az itt definiált
> matematikai rész a későbbi `src/fem/beam.ts` / `src/fem/truss.ts` specifikációja.

---

## 1. Cél és hatókör

### 1.1 Miért?

A mostani ElemLab kettős oktatási erősséggel bír: (a) látványos hőtérkép és
deformáció-animáció, (b) elemenkénti matematikai levezetés. Ami **hiányzik**: a
mérnöki statika klasszikus eszköztára — önkényes szerkezet felrajzolása,
támaszok/terhek megadása, és a **síkbeli rúdelmélet egzakt kimenetei** (N, M, V).

### 1.2 A hatókör — három szint

| Szint | Tartalom | Megoldó |
|---|---|---|
| **Váz (rúd)** — *új* | gerenda, tört gerenda, keret, rácsos tartó; támaszok (görgő/csukló/befogás/rugó); pont-, megoszló- és nyomatékterhelés; keresztmetszet + anyag | 1D rúd (Euler–Bernoulli) és rácsrúd (rudas) elemek, **N/M/V + reakció egzaktan** |
| **Felület (lemez)** — *meglevő* | sík-feszültségű szerkezetek (lyukas lemez, korabel), Von Mises-eloszlás | CST / T6 (a mai `src/fem/`) |
| **Rajzoló** — *későbbi fázis* | pont → rúd → támasz → teher kézi bevitel megfogással | ugyanaz a váz-mag |

>A két szint **nem vegyíthető** egy modellben (eltérő a csomóponti DOF-fogalom);
>a UI választásra kényszerít. Ez tudatos: a diák megérti, hogy a **modellválasztás
>maga is a mérnöki munka** része.

### 1.3 Legfontosabb elvi lépés (fizikai korrekció)

A mai gerenda-modellek valójában **folytonos lemezként** zárodnak le, ezért:
- a befogás nem tarthat szögelfordulást (nincs rotációs DOF),
- az M/V diagram csak közelítő (elemi feszültségek szalag-átlagából),
- a rácsos híd **nem** rácsos (a rács-csomópontok nyomatékot is visznek).

Az új rúd-mag ezeket **megoldja**: befogás = $u,v,\theta = 0$, az N/M/V
elemenként számolt, és a rács-híd valódi **csuklós rács** lesz. Az eredmények
(lehajlás, merevség) ettől **változnak** — jobb irányban, a tiszta statika felé.

---

## 2. Adatmodell

### 2.1 Csomópont és globális DOF

A váz-mezőben minden csomópont **három** szabadsági fok:

$$
\mathbf{u}_n = \begin{bmatrix} u_n \\ v_n \\ \theta_n \end{bmatrix},
\qquad \text{globális DOF-index: } (3n,\, 3n+1,\, 3n+2)
$$

A rács (csuklós) mezőben a forgás elhagyható: $u_n, v_n$ (2 DOF/csomópont).

### 2.2 Entitások (adattervezet)

```
FrameNode     id, x, y
FrameBeam     id, nodeI, nodeJ, sectionId, type: beam|bar
Support       nodeId, kind: free|roller|pin|fixed|spring, k_y [N/m]
Load          nodeId | beamId, kind: point|udl|moment, magnitude, dir
Section       id, name, A [m²], Iy [m⁴], Wy [m³], (h, b, t leíró adat)
Material      id, name, E [Pa], nu [–], rho [kg/m³], fy [Pa]
FrameModel    nodes, beams, supports, loads, sections, materials
```

A `SolutionResult` a mai interfész **kibővítése**, nem lecserélése:
`diagrams: Map<beamId, { n1Msr, vEnds, mEnds, sigmaTopBot }>`.

---

## 3. A rúd-elem matematikája (Euler–Bernoulli)

### 3.1 Lokális merevség (6×6, $u,\,v,\,\theta$ sorrendben)

A klasszikus síkbeli rúd: **megnyúlás** (aksziális) + **hajlítás** (nyírási
deformáció nélkül, Euler–Bernoulli):

$$
\mathbf{k}_e =
\begin{bmatrix}
\frac{EA}{L} & 0 & 0 & -\frac{EA}{L} & 0 & 0 \\
0 & \frac{12EI}{L^3} & \frac{6EI}{L^2} & 0 & -\frac{12EI}{L^3} & \frac{6EI}{L^2} \\
0 & \frac{6EI}{L^2} & \frac{4EI}{L} & 0 & -\frac{6EI}{L^2} & \frac{2EI}{L} \\
-\frac{EA}{L} & 0 & 0 & \frac{EA}{L} & 0 & 0 \\
0 & -\frac{12EI}{L^3} & -\frac{6EI}{L^2} & 0 & \frac{12EI}{L^3} & -\frac{6EI}{L^2} \\
0 & \frac{6EI}{L^2} & \frac{2EI}{L} & 0 & -\frac{6EI}{L^2} & \frac{4EI}{L}
\end{bmatrix}
$$

- $E$ anyagmodulus, $A$ keresztmetszet, $I$ inercianyomaték, $L$ elemi hossz.
- **Tulajdonságok:** szimmetrikus, pozitív szemidefinit (3 merevtest-mozgásra 0).
- A kifejtett elmozdulásfüggvények (Hermite polinomok) a lecke-matematikában jelennek meg.

Forrás (tervezett): `beam.ts → beamStiffness()`

### 3.2 Transzformáció lokálisból globálisba

Iránykoszinuszok: $c = (x_j - x_i)/L$, $s = (y_j - y_i)/L$, a 6×6-os $\mathbf{T}$-vel

$$
\mathbf{K}_e = \mathbf{T}^\top \mathbf{k}_e \mathbf{T}, \qquad
\mathbf{T} = \begin{bmatrix}
c & s & 0 & 0 & 0 & 0 \\
-s & c & 0 & 0 & 0 & 0 \\
0 & 0 & 1 & 0 & 0 & 0 \\
0 & 0 & 0 & c & s & 0 \\
0 & 0 & 0 & -s & c & 0 \\
0 & 0 & 0 & 0 & 0 & 1
\end{bmatrix}
$$

Forrás (tervezett): `beam.ts → rotationMatrix()`

### 3.3 Konzisztens tehervektorok (elem-belső terhelés)

**Megoszló folytonos terhelés** $q$ [N/m] a lokális $y$ irányban (a teljes rúdon):

$$
\mathbf{f}_e^{(q)} = \left[ 0,\; \frac{qL}{2},\; \frac{qL^2}{12},\; 0,\; \frac{qL}{2},\; -\frac{qL^2}{12} \right]^\top
$$

**Pontterhelés** $P$ a lokális $y$ irányban, a kezdőcsomóponttól $a$ távolságra:

$$
f_{v_1} = \frac{P (L\!-\!a)^2 (L + 2a)}{L^3}, \quad
f_{m_1} = \frac{P\,a (L\!-\!a)^2}{L^2}, \quad
f_{v_2} = \frac{P\,a^2 (3L - 2a)}{L^3}, \quad
f_{m_2} = -\frac{P\,a^2 (L\!-\!a)}{L^2}
$$

Axiális (normálerő) megoszló terhelésnél: $[nL/2,\; 0,\; 0,\; nL/2,\; 0,\; 0]$.

> Ez függetlenítheti a váz-hálót a terhelés helyétől; a rajzoló-fázisban a pontta
> érkező pontterhelés csomópontra kerül, a rúd-belső P a fenti képlettel.

### 3.4 Rácsrúd (truss/bar elem)

Csuklós végű rúdelem: **csak axiális** merevség, lokális 2×2-es, globálisan 4×4-es:

$$
\mathbf{k}_e^{\text{bar}} = \frac{EA}{L}
\begin{bmatrix} 1 & -1 \\ -1 & 1 \end{bmatrix}
\quad\Longrightarrow\quad
\mathbf{K}_e^{\text{bar}} = \frac{EA}{L}
\begin{bmatrix}
c^2 & cs & -c^2 & -cs \\
cs & s^2 & -cs & -s^2 \\
-c^2 & -cs & c^2 & cs \\
-cs & -s^2 & cs & s^2
\end{bmatrix}
$$

A rács-csomópontok csuklósak, ezért ott **nincs forgási DOF** — a két elem-típus
**nem keverhető** ugyanabban a hálóban (konzisztens DOF-rendszer).

Forrás (tervezett): `truss.ts → barStiffness()`

### 3.5 Elem-kimenetek (utófeldolgozás)

Az egyensúlyi rúd-végi erőkkel (lokális koordinátákban):

$$
\mathbf{f}_e^{\text{end}} = \mathbf{k}_e\,\mathbf{u}_e^{\text{loc}} - \mathbf{f}_e^{\text{teher}}
$$

- **Normálerő** $N$ [N] (konstans a rúdon),
- **Nyíróerő** $V$ [N] (struktúra: lépcsős / lineáris a terheléstől),
- **Nyomaték** $M(x)$ [Nm] (végértékek + lineáris görbe),
- **Szálfeszültség:** $\sigma_{x,\text{top/bot}} = \dfrac{N}{A} \pm \dfrac{M}{W_y}$ —
  ebből rajzolható a rúd-„stressz-térkép" is (valódi, nem közelító).

---

## 4. Támaszok

| Típus | Kötött DOF-ok | Megjegyzés |
|---|---|---|
| **Szabad** | — | — |
| **Görgő** | $v = 0$ | csak a függőleges eltolás zárva; vízszintes síkban mozoghat |
| **Sima gyám** | $u = 0$ | a normálirányú (vízszintes) eltolás zárva |
| **Csukló (pin)** | $u = 0,\; v = 0$ | a forgás szabad → **nem visz nyomatékot** |
| **Befogás** | $u = 0,\; v = 0,\; \theta = 0$ | nyomatékot, normálerőt és nyírást is felvesz |
| **Rugó** | $u = k_u,\; v = k_v$ (k a merevség) | a rögzítés helyett a diagonálisban $+k$ tag |

**Kivitel:** a kötött DOF-okat a `partition()` kihagyja (a mai `solve.ts` mintájára),
a rugó a szabad rendszer diagonálisába kerül ($K_{dd} \mathrel{+}= k$).

**Reakció:** $\mathbf{R} = \mathbf{K}\mathbf{u} - \mathbf{f}$ a kötött (és rugós) DOF-okra.
A **befogásnak van reakciónyomatéka** — ez a mai rendszerben nem létezik, és mostantól
a támasz-annotációban megjelenik.

---

## 5. Terhek

| Típus | Helye | Jelölés | Megjegyzés |
|---|---|---|---|
| Pontterhelés | csomó | $P$ [N], irány + | élve a globális erővektorba |
| Megoszló | rúdpálya | $q$ [N/m] vagy $n$ (axiális) | konzisztens tehervektor (3.3) |
| Nyomaték | csomó | $M$ [Nm] | a forgási DOF-ba → **igen közvetlen pedagógiai trükk** |
| Részleges megoszló | rúd-szakaszon | $q$, $a \to b$ | a rajzoló-fázisban kapcsolható be (P2) |
| Saját súly | anyag + szelvény | $\rho \cdot A \cdot g$ | opcionális (P2), a lecke-összehasonlítás jó árnyalója |

---

## 6. Keresztmetszet-könyvtár

Parametrikus (alapvető, képlettel generált) szelvények — ez elég az oktatáshoz:

| Szelvény | $A$ | $I_y$ | $W_y$ |
|---|---|---|---|
| Téglalap $b\times h$ | $b h$ | $\dfrac{b h^3}{12}$ | $\dfrac{b h^2}{6}$ |
| Kör $d$ | $\dfrac{\pi d^2}{4}$ | $\dfrac{\pi d^4}{64}$ | $\dfrac{\pi d^3}{32}$ |
| Üreges téglalap $b\times h\times t$ | $b h - (b-2t)(h-2t)$ | $\dfrac{b h^3 - (b-2t)(h-2t)^3}{12}$ | $I_y \cdot \dfrac{2}{h}$ |
| Cső $D\times t$ | $\dfrac{\pi (D^2 - (D-2t)^2)}{4}$ | $\dfrac{\pi (D^4 - (D-2t)^4)}{64}$ | $2 I_y / D$ |

I-profilok (illusztráció, **EN 10365**, a katalógus bővíthető/importálható):

| Profil | $A$ [cm²] | $I_y$ [cm⁴] | $W_y$ [cm³] |
|---|---|---|---|
| IPE 200 | 28,5 | 1943 | 194,3 |
| IPE 300 | 53,8 | 8356 | 557,0 |
| HEA 200 | 53,8 | 3692 | 369,2 |
| HEB 200 | 78,1 | 5696 | 569,6 |

> A szelvény-kiválasztón a „geometria" (b, h) és az „inercianyomaték" egyszerre
> látszik; a diák **kézzel változtatja** a téglalap méretét és azonnal látja
> a merevség-változást — ez a lecke lényege.

---

## 7. Anyagok

| Név | $E$ [GPa] | $\nu$ | $\rho$ [kg/m³] | $f_y$ [MPa] |
|---|---|---|---|---|
| Acél S235 | 210 | 0,30 | 7850 | 235 |
| Acél S355 | 210 | 0,30 | 7850 | 355 |
| Alumínium 6060 | 70 | 0,33 | 2700 | 150 |
| Fa C24 (GL24) | 11 | 0,30 | 420 | 24 |
| Beton C25/30 | 30 | 0,20 | 2500 | (nyomó) |

Oktatási szinten a **$E$** határozza meg a lehajlást, az **$f_y$** a feszültség-
ellenőrzést (σ ≤ f_y): a lecke-panelbe egy „kihasználtság" sor kerül.

---

## 8. Globális rendszer és megoldó

- **Összeállítás:** a meglévő `assemble.ts` mintájára, de 3 DOF/csomóponttal
  (váz) vagy 2 DOF/csomóponttal (rács). Az elem-mátrixokat szórjuk és összeadjuk.
- **Mechanika:** $\mathbf{K}\mathbf{u} = \mathbf{f}$; a kötött DOF-ok kihagyva →
  $\mathbf{K}_{ff}$ **pozitív definit**, szimmetrikus.
- **Megoldó:** a meglévő **CG + Jacobi** újrahasználható (a „CG iterációszám"
  mérőszám ezért a váz-mezőben is megmarad). Kisméretű rendszernél direkt
  Cholesky-tartalék (numerikus visszaellenőrzés).
- **Konvergencia:** a meglévő $\varepsilon_{\text{tol}} = 10^{-10}$ marad;
  a rugó-támaszok jól kondicionálják a rendszert.

---

## 9. UI-folyamat

### 9.1 Modell-szint választó

A mai `MODEL_OPTIONS` két csoportra bomlik:

- **Vázmodellek (rúd):** Konzolgerenda, Egyszerűen tartott gerenda, Kétvégén
  befogott gerenda, Portálkeret, Rácsos híd.
- **Lemezmodellek (folytonos):** Konzolos tartó (corbel), Lyukas lemez.

A váltás nem a solvert cseréli: **a modell-definíció** ($Frame$ vs $Mesh$) határozza
meg, és a renderer/animáció/legend a modell-családtól függ.

### 9.2 N/M/V kimenet

A mai M-V panel **három nézetre** bővül (szegmentált kapcsoló: $N$ / $M$ / $V$),
a jelmagyarázat és a kurzor-kiolvasás marad:

- $N(x)$: állandó a rúdon (lépcsős),
- $M(x)$: lineáris szakaszok, csomóponti értékekkel — **vég-befogásnál $M \neq 0$**,
- $V(x)$: lépcsős (pontterhelés) vagy lineáris (megoszló).

A diagramok **ezen felül a rúdkiosztozás szerint** rajzolódnak (nem x-tengelyre szorítottak).

### 9.3 UI-ellenőrző (inspect)

- **Elem-vizsgálat:** N, M_1, M_2, V, σ_top, σ_bot + a szelvény/anyag adatai
  és a **helyes képlet** (σ = N/A ± M/W).
- **Csomópont-vizsgálat:** u, v, θ + a **támasz-reakciók** (Rx, Ry, $(M_{reac})$).

### 9.4 Animáció és hőtérkép rúdokon

- A deformált alak a Hermite-alakfüggvényekkel rajzolt (a gerenda **hajlik**,
  nem torzul darabokra) — a mai `sin²` lengés megy.
- „Stressz-sáv": a rúd felülete a lokális σ_x értékével színeződik (a colormap
  újrahasználható), a csomópontokon összhangban a szomszédos rudakkal.

### 9.5 A rajzoló-fázis (később, P3)

Minimalista eszköztár: **pont** → **rúd** (megfogás a **rácsra**) →
**támasz** (görgő/csukló/befogás/rugó) → **teher** (pont/megoszló/nyomaték) →
**szelvény/anyag** a rúd tulajdonság-paneljén. Mentés: JSON, localStorage.
**Nem cél** a teljes CAD — a megszorítás tudatos (lásd a 12. fejezet kockázatát).

---

## 10. Fázisok és erőfeszítés

| Fázis | Tartalom | Erőfeszítés | Kockázat |
|---|---|---|---|
| **P0** | Tervdokumentum (ez a fájl) | kicsi | — |
| **P1** | rúd/rács-elem mag (3. fejezet), szelvény/anyag-katalógus, az 5 váz-modell átállítása, N/M/V+reakció, teszt-benchmarkok (11. fejezet) | **közepes–nagy** | alacsony (tiszta fizika, a teszt-analitikumok lefedik) |
| **P2** | tört gerenda + ferde rudak, rugó-támasz, részleges megoszló, saját súly, σ ≤ f_y kihasználtság | közepes | alacsony |
| **P3** | rajzoló-UI: pont-rúd-támasz-teher, JSON-mentés | **nagy (UI)** | a legnagyobb — szándékosan utoljára |
| **P4** | oktatási leckék mélyítése (valódi levezetés-listák, képlet-visszaellenőrzés a jobb sávban), offline export | közepes | alacsony |

### 10.1 Világos elv

**A fizika előbb, az UI később.** P1 már önmagában az app értékét („játszótér”)
oktatási eszközzé emeli, és a rajzoló-értelmezés megmagyarázhatóvá teszi a
támasz-típusokat. A P1 ellenőrizhetetlen (analitikus) fejlesztés, a P3 a vizuális.

---

## 11. Teszt-benchmarkok (analitikus verifikáció)

A `tests/` új `beams.test.ts`-je az alábbi referencia-eredményekkel dolgozik
(relatív tolerancia $10^{-9}$ direkt, $10^{-6}$ CG-s megoldással):

| # | Szerkezet | Ellenőrzendő | Analitikus eredmény |
|---|---|---|---|
| 1 | Konzol, végponton $P$ | $v_\text{tip}$ | $\dfrac{PL^3}{3EI}$ |
| 2 | Konzol, végponton $P$ | $M_\text{rögzítés}$ | $-PL$ |
| 3 | Konzol, egyenletes $q$ | $v_\text{tip}$ | $\dfrac{qL^4}{8EI}$ |
| 4 | Egyszerűen tartott, középen $P$ | $v_\text{mid}$ | $\dfrac{PL^3}{48EI}$; $M_\text{mid} = \dfrac{PL}{4}$ |
| 5 | Egyszerűen tartott, egyenletes $q$ | $v_\text{mid}$ | $\dfrac{5qL^4}{384EI}$; $M_\text{mid} = \dfrac{qL^2}{8}$; $V_\text{end} = \pm\dfrac{qL}{2}$ |
| 6 | Kétvégén befogott, $q$ | $M_\text{end}, M_\text{mid}, v_\text{mid}$ | $-\dfrac{qL^2}{12},\;\dfrac{qL^2}{24},\;\dfrac{qL^4}{384EI}$ |
| 7 | 45°-os ferde gerenda (befogott) | globális $u,v$ | rotált referenciához illeszkedik (transzformáció-konzisztencia) |
| 8 | Rács (háromszög, adott $P$) | rúderők $N$ | csomóponti módszerrel kézzel számolt |
| 9 | Erőegyensúly | $\sum R + \sum F = 0$ | numerikus nulla (a mai `node.test.ts` mintája) |
| 10 | Merevtest | $K\,u = 0$ elfordulásra/elmozdulásra | zéró energia (numerikus zéró) |
| 11 | Rugó-támaszú konzol ($k$) | $v_\text{tip}$ | $\dfrac{P}{3EI/L^3 + k}$ típusú zárt reakció |
| 12 | A régi CST tesztjei | — | változatlanok maradnak (folytonos ág érintetlen) |

A 12-es pont a „semmi nem regresszál" garanciája: a meglévő 73 teszt a két
modell-családot szétválasztva tovább fut.

---

## 12. Kockázatok és nem-célok

### 12.1 Technikai kockázat

| Kockázat | Kezelés |
|---|---|
| A rajzoló-UI elszalad | P3-at minimalista kellékekkel (nincs undo-dig, nincs csomópont-szerkesztő), mentéssel, későbbi leckékkel; a fizikai mag attól függetlenül P1-ben elkészül |
| Rúd-után konvergencia/„oszcilláció” a UDL-nél | a konzisztens tehervektor egzakt, de a teszt-6/5 a csomóponti finomítás hatását mutatja |
| A meglévő UI-kód (MV panel, legend) índízkodik a rúd-ághoz | a `diagrams.ts` `MVPanel` eltunetve új `BeamPanel`-re cserél tickelt; az animáció típus-feltétellel (frame vs plate) |

### 12.2 Explicit nem-célok

- **3D** — marad a jelenlegi WebGL-2D (forgatás a síkban).
- **Dinamika** (sajátfrekvencia, időtartomány) — külön projekt.
- **Nagyesés, másodrendű hatás (P-Δ), plasztikusság, kihajlás** — a linearitás
  oktatási korlátja; a lecke-panel jelzi, hol ér véget a modell érvényessége.
- **Fáradás, hegesztés-nagyság, rögzítési részletek** — nem szerkesztési részlet.

---

## 13. Összefoglaló — mit ad ez a verzió?

| Cél | Megvalósulás |
|---|---|
| Valódi szerkezet-modellezés | rúd + rács elemek, szelvény + anyag |
| Tiszta támaszok | görgő / sima / csukló / befogás / rugó, köztük a forgási DOF |
| Terhek | pont, megoszló (konzisztens vektor), nyomaték, saját súly (P2) |
| Egzakt kimenet | N, M, V diagramok + reakciók + σ ≤ f_y |
| Oktatási érték | a meglévő lecke/inspekt/animáció a rúd-ágra is; a 11. fejezet analitikuma |
| Két szint | folytonos lemez (mai) + váz (új) — a modell-választás maga is tananyag |

A jóváhagyás után **P1-gyel kezdődik** a megvalósítás.

---

## 14. Irodalom (kiegészítés)

- W. McGuire, R. H. Gallagher, R. D. Ziemian: *Matrix Structural Analysis*, 2nd ed., Wiley, 2000.
- K.-J. Bathe: *Finite Element Procedures*, Prentice Hall, 1996 (a rúd-elem 1.6. szakasza).
- EN 1993-1-1: 2005, 6. függelék — hengerelt profilok (EN 10365).