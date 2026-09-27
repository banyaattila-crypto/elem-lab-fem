# ElemLab — EEM (FEM) mag matematikai specifikáció

> **Verzió:** 1.1 · **Dátum:** 2026-09-27 · **Státusz:** megvalósítva és validálva (62/62 teszt)
>
> Ez a dokumentum az `src/fem/` modul teljes matematikai alapját tartalmazza.
> A képletek LaTeX-ben íródnak; a forráskód az azonos jelöléseket használja.
>
> **V1.1 változás:** bekerült a **4. fejezet: T6 kvadratikus elem** (2026-09-27, v0.7.0-ig),
> továbbá a reakcióerők (7.2) és az elosztott terhelés (5.2) képlete. A 2–3. és 5–7.
> fejezetek számozása eggyel előrébb tolódott.

---

## 1. Fizikai modell

### 1.1 Kiindulás: lineáris rugalmasságtan

Egy $\Omega \subset \mathbb{R}^2$ tartományon, $\Gamma_u$ rögzített és $\Gamma_t$ terhelt peremmel.
Kis elmozdulások, lineárisan rugalmas anyag, statikus terhelés.

**Egyensúlyi egyenlet (erőegyenlet):**

$$
\nabla \cdot \boldsymbol{\sigma} + \mathbf{b} = \mathbf{0} \quad \text{peremfeltételekkel:} \quad
\mathbf{u} = \bar{\mathbf{u}} \text{ on } \Gamma_u, \quad
\boldsymbol{\sigma}\cdot\mathbf{n} = \bar{\mathbf{t}} \text{ on } \Gamma_t
$$

### 1.2 Alapegyenletek (síkbeli állapot)

| Összefüggés | Képlet | Jelentés |
|---|---|---|
| Elmozdulás | $\mathbf{u} = \begin{bmatrix} u_x \\ u_y \end{bmatrix}$ | csomópontonként 2 szabadsági fok |
| Alakváltozás (geometria) | $\boldsymbol{\varepsilon} = \begin{bmatrix} \varepsilon_x \\ \varepsilon_y \\ \gamma_{xy} \end{bmatrix} = \begin{bmatrix} \dfrac{\partial u_x}{\partial x} \\[4pt] \dfrac{\partial u_y}{\partial y} \\[4pt] \dfrac{\partial u_x}{\partial y} + \dfrac{\partial u_y}{\partial x} \end{bmatrix}$ | lineáris alakváltozás-tensor |
| Anyagtörvény (Hooke) | $\boldsymbol{\sigma} = \mathbf{D}\,\boldsymbol{\varepsilon}$ | lineáris rugalmasság |

### 1.3 Anyagmátrix $\mathbf{D}$

**Síkfeszültség-állapot** (vékony lemez, $\sigma_z = 0$) — az ElemLab MVP ezt használja:

$$
\mathbf{D}_{\text{ps}} = \frac{E}{1-\nu^2}
\begin{bmatrix}
1 & \nu & 0 \\
\nu & 1 & 0 \\
0 & 0 & \dfrac{1-\nu}{2}
\end{bmatrix}
$$

**Síkdeformációs állapot** ($\varepsilon_z = 0$, vastag test):

$$
\mathbf{D}_{\text{pd}} = \frac{E}{(1+\nu)(1-2\nu)}
\begin{bmatrix}
1-\nu & \nu & 0 \\
\nu & 1-\nu & 0 \\
0 & 0 & \dfrac{1-2\nu}{2}
\end{bmatrix}
$$

ahol $E$ a Young-modulus [Pa], $\nu$ a Poisson-tényező [–].

### 1.4 Von Mises összehasonlító feszültség

Síkbeli feszültségállapotra ($\sigma_z = \tau_{xz} = \tau_{yz} = 0$):

$$
\sigma_{\text{vM}} = \sqrt{\sigma_x^2 + \sigma_y^2 - \sigma_x\sigma_y + 3\tau_{xy}^2}
$$

Ez jelenik meg a hőtérképen. Forrás: `cst.ts → vonMises()`

---

## 2. A végeselemes közelítés

### 2.1 Tartomány-felbontás

A tartományt háromszögekre bontjuk: $\Omega \approx \bigcup_e \Omega_e$.
Az ElemLab **kétféle háromszögelemet** használ:

| Elem | Csomópontok | DOF | Alakfüggvény | Alakváltozás | Feszültség |
|---|---|---|---|---|---|
| **CST** (Constant Strain Triangle) | 3 sarok | 6 | lineáris | lineáris | konstans |
| **T6** (kvadratikus, izoparaméteres) | 3 sarok + 3 élközép | 12 | kvadratikus | lineáris változás | Gauss-pontonként változik |

A CST a gyors, egyszerű út; a **T6 adja a lényegesen jobb hajlítási pontosságot**
(13,1% → 3,6% hiba a konzolgerenda analitikushoz képest, 4.6. fejezet).
Az alkalmazásban a felhasználó kapcsolóval vált a kettő között azonos geometrián
(`state.elementType`); **induláskor CST az aktív**.

### 2.2 Alakfüggvények

A CST lineáris elmozdulástérrel dolgozik. A csomóponti alakfüggvények a természetes
koordinátákban ($L_1 + L_2 + L_3 = 1$):

$$
N_1 = L_1, \qquad N_2 = L_2, \qquad N_3 = L_3
$$

és az elem belsejében $\mathbf{u}^{(e)}(x,y) = \sum_{i=1}^{3} N_i(x,y)\,\mathbf{u}_i$.

### 2.3 Geometriai mennyiségek (csúszóint-koordináták)

A három csomópont: $(x_1,y_1), (x_2,y_2), (x_3,y_3)$, **CCW sorrendben**. Legyen:

$$
\begin{aligned}
b_1 &= y_2 - y_3, & c_1 &= x_3 - x_2 \\
b_2 &= y_3 - y_1, & c_2 &= x_1 - x_3 \\
b_3 &= y_1 - y_2, & c_3 &= x_2 - x_1
\end{aligned}
$$

**Az elem területe:**

$$
A = \tfrac{1}{2}\,(b_1 c_2 - b_2 c_1)
$$

(CCW sorrendnél $A > 0$; a kód erre hibát dob.) Forrás: `cst.ts → elementGeometry()`

### 2.4 B mátrix (alakváltozás-elmozdulás mátrix)

Konstans: $\boldsymbol{\varepsilon} = \mathbf{B}\,\mathbf{u}_e$, ahol $\mathbf{B}$ 3×6-os:

$$
\mathbf{B} = \frac{1}{2A}
\begin{bmatrix}
b_1 & 0 & b_2 & 0 & b_3 & 0 \\
0 & c_1 & 0 & c_2 & 0 & c_3 \\
c_1 & b_1 & c_2 & b_2 & c_3 & b_3
\end{bmatrix}
$$

Forrás: `cst.ts → strainMatrix()`

---

## 3. Elemi merevségi mátrix

### 3.1 Gyenge alak → elemi egyenlet

A virtuális munka elvéből (a tehetetlenségi és csillapítási tagokat elhagyva):

$$
\mathbf{k}_e \,\mathbf{u}_e = \mathbf{f}_e
$$

### 3.2 A CST merevségi mátrix

$$
\boxed{\;\mathbf{k}_e = t\,A\,\mathbf{B}^\top \mathbf{D}\, \mathbf{B}\;}
$$

ahol $t$ a lemezvastagság [m], $A$ az elem területe [m²].

- Dimenzió: $6 \times 6$
- Tulajdonságai: **szimmetrikus**, **pozitív szemidefinit** (merevtest-mozgásokra nulla),
  soralgebrai rendezés: $[u_{x1}, u_{y1}, \; u_{x2}, u_{y2}, \; u_{x3}, u_{y3}]$

Forrás: `cst.ts → elementStiffness()`

### 3.3 Kifejtett alak (referencia)

Síkfeszültségre, az átló tagok (k = 1, 2, 3 csomópont-indexre):

$$
k_{(kx,kx)} = \frac{E\,t}{1-\nu^2}\cdot\frac{b_k^2}{4A}, \qquad
k_{(ky,ky)} = \frac{E\,t}{1-\nu^2}\cdot\frac{c_k^2}{4A}
$$

$$
k_{(kx,ky)} = \frac{E\,t}{1-\nu^2}\cdot\frac{b_k c_k}{4A} \cdot \frac{1+\nu}{1}, \qquad
k_{(kx, l_y)} = \frac{E\,t}{1-\nu^2}\cdot\frac{b_k b_l + \tfrac{1-\nu}{2} c_k c_l}{4A}
$$

---

## 4. A T6 kvadratikus elem

### 4.1 Csúcssorrend és geometria

A T6 elem hat csomópontja, **csúcs-sorrendben**:

$$
\mathbf{u}_e = [u_{x1}, u_{y1}, \; u_{x2}, u_{y2}, \; u_{x3}, u_{y3}, \; u_{x4}, u_{y4}, \; u_{x5}, u_{y5}, \; u_{x6}, u_{y6}]^\top
$$

ahol az 1–3 index a **sarokcsúcsok** (CCW sorrendben), a 4–6 az oldalközépek:
$m_{12}$ (1–2 él), $m_{23}$ (2–3 él), $m_{31}$ (3–1 él).

Természetes (területi) koordináták: $L_1 + L_2 + L_3 = 1$, ahol $L_3 = 1 - L_1 - L_2$.

| Csúcs | $(L_1, L_2, L_3)$ |
|---|---|
| 1 (sarok) | $(1, 0, 0)$ |
| 2 (sarok) | $(0, 1, 0)$ |
| 3 (sarok) | $(0, 0, 1)$ |
| 4 ($m_{12}$) | $(\tfrac{1}{2}, \tfrac{1}{2}, 0)$ |
| 5 ($m_{23}$) | $(0, \tfrac{1}{2}, \tfrac{1}{2})$ |
| 6 ($m_{31}$) | $(\tfrac{1}{2}, 0, \tfrac{1}{2})$ |

A geometria **izoparaméteres**: ugyanaz az $N_i(L)$ adja az elmozdulást és a koordinátát.
A sarok-háromszög területe pozitív kell legyen (CCW), különben a kód hibát dob.
Forrás: `t6.ts → t6Geometry()`

### 4.2 Alakfüggvények

$$
\begin{aligned}
N_1 &= L_1(2L_1 - 1), & N_2 &= L_2(2L_2 - 1), & N_3 &= L_3(2L_3 - 1) \\
N_4 &= 4L_1L_2,     & N_5 &= 4L_2L_3,     & N_6 &= 4L_3L_1
\end{aligned}
$$

Partíciós egység: $\sum_{i=1}^{6} N_i = 1$ minden pontban. Az éleken a két szomszédos
középcsúcs nem járul hozzá ($N_4 = 0$ a 2–3 élen), tehát az elem **C¹-kompatibilis**:
szomszédos T6-elemek közös éleken a feszültségmező folytonos.
Forrás: `t6.ts → t6Shape()`

**Deriváltak** a láncszabállyal ($\partial L_3/\partial L_1 = \partial L_3/\partial L_2 = -1$):

$$
\frac{\partial N_i}{\partial L_1} = \left[\, 4L_1 - 1,\; 0,\; 1 - 4L_3,\; 4L_2,\; -4L_2,\; 4(L_3 - L_1) \,\right]_i
$$

$$
\frac{\partial N_i}{\partial L_2} = \left[\, 0,\; 4L_2 - 1,\; 1 - 4L_3,\; 4L_1,\; 4(L_3 - L_2),\; -4L_1 \,\right]_i
$$

Forrás: `t6.ts → t6ShapeDerivs()`

### 4.3 Három pontos Gauss-kvadratúra

A háromszög referencia-területe $\tfrac{1}{2}$; a súlyok ehhez igazodnak
($\sum w_i = \tfrac{1}{2}$, egyenként $w_i = \tfrac{1}{6}$). A pontok az élek középpontjai:

| Gauss-pont | $(L_1, L_2)$ | $w$ |
|---|---|---|
| 1 | $(\tfrac{1}{2}, 0)$ | $\tfrac{1}{6}$ |
| 2 | $(\tfrac{1}{2}, \tfrac{1}{2})$ | $\tfrac{1}{6}$ |
| 3 | $(0, \tfrac{1}{2})$ | $\tfrac{1}{6}$ |

**Pontosság:** a $\mathbf{B}$ mátrix lineáris $L$-ben, így a $\mathbf{B}^\top \mathbf{D} \mathbf{B}$
integrandus **kvadratikus** — ezt a szabály **egzaktan** integrálja (ezért elég 3 pont).
Forrás: `t6.ts → T6_GAUSS`

### 4.4 Jacobian és láncszabály

A geometriai leképezés: $x = \sum_i N_i x_i$, $y = \sum_i N_i y_i$, amiből a Jacobian:

$$
\mathbf{J} = \begin{bmatrix} \dfrac{\partial x}{\partial L_1} & \dfrac{\partial x}{\partial L_2} \\[4pt] \dfrac{\partial y}{\partial L_1} & \dfrac{\partial y}{\partial L_2} \end{bmatrix},
\qquad
\det \mathbf{J} = j_{11} j_{22} - j_{12} j_{21}
$$

Az inverz-transzponzált láncszabály adja a szükséges deriváltakat:

$$
\frac{\partial N_i}{\partial x} = \frac{j_{22}\,\frac{\partial N_i}{\partial L_1} - j_{21}\,\frac{\partial N_i}{\partial L_2}}{\det \mathbf{J}},
\qquad
\frac{\partial N_i}{\partial y} = \frac{-j_{12}\,\frac{\partial N_i}{\partial L_1} + j_{11}\,\frac{\partial N_i}{\partial L_2}}{\det \mathbf{J}}
$$

azaz $\left(\mathbf{J}^{-1}\right)^\top \cdot \left[\frac{\partial N_i}{\partial L_1}, \frac{\partial N_i}{\partial L_2}\right]^\top$.

A $\det \mathbf{J} \le 0$ eset a kód hibát dob (inverz vagy torzult elem).
Forrás: `t6.ts → t6BMatrix()`

### 4.5 B mátrix (3×12)

Egy Gauss-pontban, $i = 1 \dots 6$ csúcsra:

$$
\mathbf{B}(\mathbf{B}_g) = \begin{bmatrix}
\dfrac{\partial N_i}{\partial x} & 0 \\[6pt]
0 & \dfrac{\partial N_i}{\partial y} \\[6pt]
\dfrac{\partial N_i}{\partial y} & \dfrac{\partial N_i}{\partial x}
\end{bmatrix}_{i=1}^{6}
$$

A $\mathbf{B}$ itt **nem konstans**: minden Gauss-pontban újraszámoljuk.
Forrás: `t6.ts → t6BMatrix()`

### 4.6 A T6 merevségi mátrix

$$
\boxed{\;\mathbf{k}_e = t \sum_{g=1}^{3} w_g \, \det\mathbf{J}_g \;\, \mathbf{B}_g^\top \mathbf{D}\, \mathbf{B}_g\;}
$$

- Dimenzió: $12 \times 12$
- Tulajdonságai: **szimmetrikus**, **pozitív szemidefinit** (6 merevtest-mozgásra nulla),
  a 6×6-os CPT-merevtest-mátrix nemnulla zéruszerkezetét a kvadratikus tér adja
- A súlyt a vastagság egyszerre szorozza be (`k.map(row => row * thickness)`), nem Gauss-pontonként

**Ellenőrzött numerikus eredmény** (konzolgerenda, azonos háló, `tests/t6.test.ts`):

| Elem | $\delta_{\max} / \delta_{\text{analitikus}}$ | Hiba |
|---|---|---|
| CST | 0,869 | 13,1% |
| **T6** | **1,036** | **3,6%** |

Forrás: `t6.ts → t6Stiffness()`

### 4.7 Elemi feszültség — Gauss-átlag

Az elemi feszültség nem konstans; a kód a három Gauss-pont értékét **súlyozott átlagolja**,
és ezt az értéket használja a hőtérképhez és a Von Mises kiértékeléshez:

$$
\boldsymbol{\sigma}_e = \frac{\sum_g w_g \det\mathbf{J}_g \, \mathbf{D} \mathbf{B}_g \mathbf{u}_e}{\sum_g w_g \det\mathbf{J}_g}
$$

Ennek oka a vizualizáció: a színkép elemenkénti egy értéket kér. A 3D nézet ezen felül
a **csúcs-színezéssel** közelít, ami a környező elemek értékeinek átlagolása a csúcsban.
Forrás: `t6.ts → t6Stress()`

### 4.8 CST → T6 hálókonverzió

Minden CST háromszögből **egy** T6 lesz; a három él közepére új csomópont kerül.
A közös élek közép-csomópontjait **él-hashing** (`min:max` kulcs) osztja meg, így a
háló **konform** marad — nincs szabad él, nincs rés a szomszédos elemek között.

**Peremfeltételek átvitelét:**
- **Rögzítés:** ha egy él mindkét sarokcsúcsa rögzített, az él közép-csomópontja is rögzített
  (különben az él középső pontja szabad lenne → külön megnyúlás az elemen belül)
- **Terhelés:** a sarokcsomópontok azonosítói változatlanok, ezért a csomóponti erők
  ($\mathbf{f}$) érvényesek maradnak; az új középcsúcsok terhelése nulla

Forrás: `models/t6convert.ts → convertToT6()`

---

## 5. Globális rendszer

### 5.1 Összeállítás (assembly)

Minden $e$ elemre: a $\mathbf{k}_e$ mátrix elemeit (CST: 6×6, T6: 12×12) a globális
szabadsági fok-indexekre szórjuk. A csomópont $n$ DOF-jai:

$$
\text{dof}(n) = (2n,\; 2n+1)
$$

Az azonos pozícióba kerülő tagok **összeadódnak**:

$$
K_{ij} = \sum_{e} \left(\mathbf{k}_e\right)_{ij} \quad \text{ha } i,j \in e \text{ DOF-jai}
$$

A rendszer: $\mathbf{K}\,\mathbf{u} = \mathbf{f}$, ahol $\mathbf{f}$ a csomóponti erők vektora [N].
$\mathbf{K}$ ritka, szimmetrikus, pozitív definit a rögzítések után.
Forrás: `assemble.ts → assemble()`

### 5.2 Peremfeltételek: DOF-elimináció

A rögzített csomópontok DOF-jait ($\mathbf{u}_c = \mathbf{0}$) **kihagyjuk** a rendszerből.
A szabadsági fokokat felosztjuk: $\mathbf{u} = [\mathbf{u}_f, \mathbf{u}_c]^\top$, ahonnan:

$$
\begin{bmatrix} \mathbf{K}_{ff} & \mathbf{K}_{fc} \\ \mathbf{K}_{cf} & \mathbf{K}_{cc} \end{bmatrix}
\begin{bmatrix} \mathbf{u}_f \\ \mathbf{0} \end{bmatrix}
=
\begin{bmatrix} \mathbf{f}_f \\ \mathbf{f}_c \end{bmatrix}
\quad\Longrightarrow\quad
\mathbf{K}_{ff}\,\mathbf{u}_f = \mathbf{f}_f
$$

Az így kapott $\mathbf{K}_{ff}$ **pozitív definit** → Conjugate Gradient alkalmazható.
Forrás: `solve.ts → partition()`

### 5.3 Terhelések: pont- és szakasz-menti terhelés

**Pontterhelés** a szabad DOF-khoz közvetlenül kerül: $\mathbf{f}_i = F_i$.

**Elosztott terhelés** a `bc.distributed` mezőben, $q_y$ [N/m] egységgel, vízszintes
szakaszra $(x_1, y) \rightarrow (x_2, y)$ megadva. A megoldás **nem elem-belső integrál**,
hanem **szakasz-szintű erő-megosztás**:

1. A szakasz teljes ereje: $\displaystyle F_{\text{össz}} = q_y \cdot L$, ahol
   $L = \lVert (x_2 - x_1, \, y_2 - y_1) \rVert$ [m] → $F_{\text{össz}}$ [N]
2. A szakasz **belső** csomópontjait kiválasztjuk (a vízszintes és a függőleges
   befoglaló doboz alapján, $10^{-6}$ toleranciával)
3. Mindegyikhez azonos súlyt rendelünk, és a teljes erőt arányosan szétosztjuk:

$$
f_{i,y} = F_{\text{össz}} \cdot \frac{w_i}{\sum_j w_j},
\qquad \text{csak az } y \text{ DOF-ra, } f_{i,x} = 0
$$

Ez **hálósűrűségtől független** eloszlást ad (finomabb hálón ugyanazok az erők),
de a valódi feszültségmező közelítése helyett az eredőerőt tartja meg pontosan:
$\sum_i f_{i,y} = q_y \cdot L$ minden sűrűségnél. Ez oktatási célból a helyes
választás: a terhelőerő nagysága soha nem "úszik" a háló finomításával.

**Korlát:** a módszer vízszintes szakaszra és $y$ irányú terhelésre van szűkítve
($\partial q_x / \partial x$ nincs implementálva). A $q_y$ **nem** szorozódik a
lemezvastagsággal: a 2D modellben a terhelés a keresztmetszet egységnyi hosszára vonatkozik.
Forrás: `assemble.ts → assemble()` (`onSegment`, `nodeWeight`)

---

## 6. A Conjugate Gradient módszer

### 6.1 Algoritmus (Jacobi előkondicionálóval)

Adott $\mathbf{A} = \mathbf{K}_{ff}$ SPD mátrix és $\mathbf{b} = \mathbf{f}_f$ vektor:

$$
\begin{aligned}
\mathbf{r}_0 &= \mathbf{b} - \mathbf{A}\mathbf{x}_0 = \mathbf{b}, &
\mathbf{z}_0 &= \mathbf{M}^{-1}\mathbf{r}_0, &
\mathbf{p}_0 &= \mathbf{z}_0 \\
\alpha_k &= \frac{\mathbf{r}_k^\top \mathbf{z}_k}{\mathbf{p}_k^\top \mathbf{A}\,\mathbf{p}_k} \\
\mathbf{x}_{k+1} &= \mathbf{x}_k + \alpha_k \mathbf{p}_k, &
\mathbf{r}_{k+1} &= \mathbf{r}_k - \alpha_k \mathbf{A}\mathbf{p}_k \\
\mathbf{z}_{k+1} &= \mathbf{M}^{-1}\mathbf{r}_{k+1}, &
\beta_k &= \frac{\mathbf{r}_{k+1}^\top \mathbf{z}_{k+1}}{\mathbf{r}_k^\top \mathbf{z}_k} \\
\mathbf{p}_{k+1} &= \mathbf{z}_{k+1} + \beta_k \mathbf{p}_k
\end{aligned}
$$

ahol $\mathbf{M} = \operatorname{diag}(\mathbf{A})$ (Jacobi előkondicionáló).

### 6.2 Megállási feltétel

$$
\frac{\|\mathbf{r}_k\|_2}{\|\mathbf{b}\|_2} < \varepsilon_{\text{tol}} \qquad (\varepsilon_{\text{tol}} = 10^{-10})
$$

**Fontos:** a konvergenciát a **valódi** $\|\mathbf{r}\|$-val ellenőrizzük, nem a
prekondicionált $\mathbf{r}^\top\mathbf{M}^{-1}\mathbf{r}$-felülettel — ez utóbbi merev
átlóknál korai kilépést okozhat (bukta a tesztben is).
Forrás: `linalg.ts → conjugateGradient()`

### 6.3 Ritka mátrix-tárolás (CSR)

A $\mathbf{K}$ mátrix **Compressed Sparse Row** formátumban él:

$$
\text{rowPtr}[0..n], \quad \text{colIdx}[0..nnz), \quad \text{values}[0..nnz)
$$

a $\mathbf{y} = \mathbf{A}\mathbf{x}$ szorzat:

$$
y_i = \sum_{k=\text{rowPtr}[i]}^{\text{rowPtr}[i+1]-1} \text{values}[k] \cdot x_{\text{colIdx}[k]}
$$

Forrás: `linalg.ts → SparseMatrix`

---

## 7. Utófeldolgozás

### 7.1 Elemi feszültség

Minden elemre, az elemi elmozdulás-vektorból $\mathbf{u}_e$:

$$
\boldsymbol{\varepsilon}_e = \mathbf{B}\,\mathbf{u}_e, \qquad
\boldsymbol{\sigma}_e = \mathbf{D}\,\mathbf{B}\,\mathbf{u}_e
$$

A CST konstans feszültségű elem: $\boldsymbol{\sigma}_e$ az elemen belül **állandó**.
A T6 esetén a feszültség Gauss-pontonként számolódik, és a hőtérképhez súlyozott
átlagot használ (lásd a 4.7. fejezetet).
Forrás: `cst.ts → elementStress()`, `t6.ts → t6Stress()`

### 7.2 Reakcióerők

A DOF-elimináció miatt a rögzített csomópontok $\mathbf{R} = \mathbf{K}\,\mathbf{u} - \mathbf{f}$
maradékából számíthatók vissza — ahol $\mathbf{u}$ a **teljes** (rögzített DOF-okkal együtt)
elmozdulásvektor, $\mathbf{u}_c = 0$ helyettesítéssel:

$$
\mathbf{R}_c = \left(\mathbf{K}\,\mathbf{u} - \mathbf{f}\right)_c
$$

**Azonosító teszt (erőegyensúly):** ha a modell nincs saját súlyterhelés alatt, a
külső terhelés és a reakciók összege nulla:

$$
\sum_{i \in c} \mathbf{R}_i + \sum_i \mathbf{F}_i = \mathbf{0}
\quad \Longrightarrow \quad \sum_{i \in c} \mathbf{R}_i = -\sum_i \mathbf{F}_i
$$

Ez a `tests/node.test.ts` 7 tesztjének egyik ellenőrzési kritériuma (numerikus nulla).
A reakció ugyanannak a támasznak a **legközelebbi csomópontjának** értéke, ezért a
séma felirata a támasz-szimbólum mellé kerül, nem magához a szimbólumhoz igazítva.
Forrás: `solve.ts → solve()` (`reactions: Map<number, Vec2>`)

### 7.3 Deformált alak

A megjelenítés: $\tilde{\mathbf{x}} = \mathbf{x} + s\cdot\mathbf{u}$, ahol $s$ a
deformáció-nagyítás (felhasználói csúszka; az elmozdulások mikrométer-méletűek).
Az animáció a deformálatlan és a deformált alak között ingad:
$s(t) = s_{\max}\,\sin^2(\pi t / T)$ a $T = 1{,}6$ s periódussal.

### 7.4 Színképzés

A hőtérkép: $c = \mathcal{C}\!\left(\sigma_{\text{vM}}^{(e)} / \max_e \sigma_{\text{vM}}^{(e)}\right)$,
ahol $\mathcal{C}$ az **egyárnyalatú kék** lámpatörpe (`src/viz/colormap.ts`): 9 kontrollpont
#0a1830 → #c6e5f4, **Oklab-színtérben interpolálva**, így a színátmenet egyenletes
(nincs fényerő-ingadozás a lépcsők között). Egyetlen árnyalat, monoton világossággal:
a szín kizárólag a feszültség nagyságát hordozza. A Canvas 2D, a WebGL 3D és a
HTML-legenda ugyanazt a $\mathcal{C}$-t használja, egyetlen forrásból.

A 3D (WebGL) nézet ezen felül **csúcs-színezést** használ: a színt a csúcshoz kapcsolódó
elemek $\sigma_{\text{vM}}$ értékeinek átlagából számolja, ami a folytonos mező
közelítése egy véges elemhálón.

---

## 8. Validáció — analitikus referenciaeredmények

### 8.1 Konzolgerenda (Euler–Bernoulli)

Végterhelésű konzolgerenda szabad végi hajlása:

$$
\delta = \frac{P\,L^3}{3\,E\,I}, \qquad I = \frac{t\,H^3}{12}
$$

Azonos hálón mért eredmények (`tests/t6.test.ts`, `tests/fem.test.ts`):

| Elem | $\delta_{\max} / \delta_{\text{analitikus}}$ | Hiba |
|---|---|---|
| CST | 0,869 | 13,1% |
| **T6** | **1,036** | **3,6%** |

A CST túl merev a hajláshoz (ismert jelenség, „shear locking" jellegű torzítás);
a T6 kvadratikus konvergenciája miatt 3,5×-szer pontosabb. A teszt a T6-ra
küszöbövet tesz: $0{,}9 < \delta_{\text{FE}} / \delta_{\text{analitikus}} < 1{,}05$,
a CST-re pedig a hiba csökkenését ellenőrzi (`errT6 < errCST`).
Forrás: `models/cantilever.ts → cantileverAnalyticalDeflection()`

### 8.2 M/V diagramok — gerenda-képletek

A hajlítási feszültség és a nyíróerő kapcsolata (a hajlítási hengerfej-modell):

$$
\sigma = \frac{M}{W} \quad\Longrightarrow\quad \Delta\sigma = \frac{\Delta M}{W},
\qquad W = \frac{t\,H^2}{6}
$$

$$
V = \frac{\mathrm{d}M}{\mathrm{d}x}
$$

Ezek a képletek a `tests/newmodels.test.ts` analitikus ellenőrzéseit adják
(pl. egyszerűen tartott gerenda középi pontterheléssel: $M_{\max} = PL/4$ a középen,
$V$ a középen $\pm P/2$-re vált; a $V$ számítása a zajos elemszintű $\tau$-integrál
helyett a $\mathrm{d}M/\mathrm{d}x$ deriváltra állt át).
Forrás: `viz/diagrams.ts`

### 8.3 Lyukas lemez — feszültségkoncentráció

Végtelen lemez körlyukkal, egyirányú húzással $\sigma_0$:

$$
\sigma_{\max} = K_t\,\sigma_0, \qquad K_t \xrightarrow{d/W \to 0} 3
$$

A véges, egységes rácsos modell a lépcsős lyukhatár sarkainál szinguláris pontokat
tartalmaz, ezért a mért csúcs a szimulációban $3\sigma_0$ **felett** van: a mért
$K_t$ a hálósűrűséggel **nő** (4,1 → 5,0), tehát a konvergencia itt nem-monoton.

**Kísérlet és eredménye (2026-09-26, visszavonva):** a körre való projekció + a
sarokcsúcsok CCW-javítása szilánk-elemeket (negatív terület) adott; a Laplace-simítás
behagyása közben üres foltok maradtak a hálóban. A pontos $K_t \approx 3$ eléréséhez
**valódi határkövető háló** (Delaunay-voronoi vagy advancing front) szükséges — ez
nyitott feladat, a T6 elem önmagában nem oldja meg.
Forrás: `models/plateWithHole.ts → plateWithHoleKt()`

### 8.4 Szolver-egységek

| Mennyiség | SI-mértékegység | Tipikus érték |
|---|---|---|
| Hossz | m | 0.5 – 10 |
| Erő | N | 100 – 10 000 |
| Young-modulus $E$ | Pa | 1e9 – 210e9 |
| Feszültség | Pa | 1e3 – 1e9 |
| Elmozdulás | m | 1e-9 – 1e-3 |

---

## 9. Elméleti korlátok, ismert hibák

| Jelenség | Ok | Kezelés |
|---|---|---|
| A CST merev a hajlásnál | lineáris alakfüggvény → konstans alakváltozás | **Megoldva: T6 elem** (4. fejezet) — 13,1% → 3,6%; az alkalmazás váltója azonos geometrián összeveti a kettőt |
| A T6-nál nincs „tiszta" elemi feszültség | a feszültség Gauss-pontonként változik | a hőtérkép súlyozott átlagot használ (4.7), a 3D nézet csúcs-színezést |
| Lépcsős lyukhatár csúcsa > 3σ₀, és a $K_t$ nő a sűrűséggel | szinguláris újramenet-sarkok a rácsos hálón | **nyitott:** határkövető háló (Delaunay / advancing front); a körre-projekciós kísérlet 2026-09-26-án meghiúsult |
| Poisson-locking vastag testeknél | $\nu \to 0.5$-nél $\mathbf{D}$ szinguláris | az anyagkatalógus $\nu$ értékei 0,30–0,35 között vannak, tehát távol az elfajzástól; a UI nem kényszerít ki korlátot |
| Terhelés egyetlen csomóponton | szinguláris feszültségmező | **részben megoldva:** van elosztott terhelés is (5.3), de az is csomóponti erőkre képez le |
| Az elosztott terhelés csak vízszintes, $y$ irányú | a szakasz-szintű erő-megosztás megszorítása | vízszintes gerenda-modellekhez elegendő; általános peremterhelés nyitott |
| Nincs 1D rúdelem a magban | a `fem/` modul csak 2D háromszögelemeket ismer | a rácsos híd CST-háló; külön rúdelem nyitott feladat |
| A `docs/fem-spec.md` V1.0-ás állapota | a T6 a specifikáció után készült | **rendbetett** a V1.1-ben (4. fejezet) |

---

## 10. Irodalom

- O. C. Zienkiewicz, R. L. Taylor: *The Finite Element Method for Solid and Structural Mechanics*, 7th ed., Butterworth-Heinemann, 2013.
- K.-J. Bathe: *Finite Element Procedures*, Prentice Hall, 1996.
- J. N. Reddy: *An Introduction to the Finite Element Method*, 4th ed., McGraw-Hill, 2019.
- J. Shewchuk: *An Introduction to the Conjugate Gradient Method Without the Agonizing Pain*, CMU TR, 1994.
