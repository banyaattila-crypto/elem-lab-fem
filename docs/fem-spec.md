# ElemLab — EEM (FEM) mag matematikai specifikáció

> **Verzió:** 1.0 · **Dátum:** 2026-09-26 · **Státusz:** megvalósítva és validálva (15/15 teszt)
>
> Ez a dokumentum az `src/fem/` modul teljes matematikai alapját tartalmazza.
> A képletek LaTeX-ben íródnak; a forráskód az azonos jelöléseket használja.

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
Az ElemLab konstans feszültségű háromszögelemet (**CST — Constant Strain Triangle**) használ:
3 csomópont, elemenként **6 szabadsági fok** $\mathbf{u}_e = [u_{x1}, u_{y1}, u_{x2}, u_{y2}, u_{x3}, u_{y3}]^\top$.

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

## 4. Globális rendszer

### 4.1 Összeállítás (assembly)

Minden $e$ elemre: a $\mathbf{k}_e$ 6×6 mátrix elemeit a globális szabadsági fok-indexekre
szórjuk. A csomópont $n$ DOF-jai:

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

### 4.2 Peremfeltételek: DOF-elimináció

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

---

## 5. A Conjugate Gradient módszer

### 5.1 Algoritmus (Jacobi előkondicionálóval)

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

### 5.2 Megállási feltétel

$$
\frac{\|\mathbf{r}_k\|_2}{\|\mathbf{b}\|_2} < \varepsilon_{\text{tol}} \qquad (\varepsilon_{\text{tol}} = 10^{-10})
$$

**Fontos:** a konvergenciát a **valódi** $\|\mathbf{r}\|$-val ellenőrizzük, nem a
prekondicionált $\mathbf{r}^\top\mathbf{M}^{-1}\mathbf{r}$-felülettel — ez utóbbi merev
átlóknál korai kilépést okozhat (bukta a tesztben is).
Forrás: `linalg.ts → conjugateGradient()`

### 5.3 Ritka mátrix-tárolás (CSR)

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

## 6. Utófeldolgozás

### 6.1 Elemi feszültség

Minden elemre, az elemi elmozdulás-vektorból $\mathbf{u}_e$:

$$
\boldsymbol{\varepsilon}_e = \mathbf{B}\,\mathbf{u}_e, \qquad
\boldsymbol{\sigma}_e = \mathbf{D}\,\mathbf{B}\,\mathbf{u}_e
$$

A CST konstans feszültségű elem: $\boldsymbol{\sigma}_e$ az elemen belül **állandó**.
Forrás: `cst.ts → elementStress()`

### 6.2 Deformált alak

A megjelenítés: $\tilde{\mathbf{x}} = \mathbf{x} + s\cdot\mathbf{u}$, ahol $s$ a
deformáció-nagyítás (felhasználói csúszka; az elmozdulások mikrométer-méretűek).

### 6.3 Színképzés

A hőtérkép: $c = \text{viridis}\!\left(\sigma_{\text{vM}}^{(e)} / \max_e \sigma_{\text{vM}}^{(e)}\right)$

---

## 7. Validáció — analitikus referenciaeredmények

### 7.1 Konzolgerenda (Euler–Bernoulli)

Végterhelésű konzolgerenda szabad végi hajlása:

$$
\delta = \frac{P\,L^3}{3\,E\,I}, \qquad I = \frac{t\,H^3}{12}
$$

A CST-számítás finom hálón az analitikus érték **60–100%-át** adja (a CST túl merev
a hajláshoz — ismert jelenség, „shear locking" jellegű torzítás; a teszt ezt a sávot
ellenőrzi). Forrás: `models/cantilever.ts → cantileverAnalyticalDeflection()`

### 7.2 Lyukas lemez — feszültségkoncentráció

Végtelen lemez körlyukkal, egyirányú húzással $\sigma_0$:

$$
\sigma_{\max} = K_t\,\sigma_0, \qquad K_t \xrightarrow{d/W \to 0} 3
$$

A véges, egységes rácsos modell a lépcsős lyukhatár sarkainál szinguláris pontokat
tartalmaz, ezért a mért csúcs a szimulációban $3\sigma_0$ **felett** van (durva
hálón ~$4\sigma_0$). A kerekített (poligon) lyukhatár és finomabb háló közelíti a $3\sigma_0$-t.
Forrás: `models/plateWithHole.ts → plateWithHoleKt()`

### 7.3 Szolver-egységek

| Mennyiség | SI-mértékegység | Tipikus érték |
|---|---|---|
| Hossz | m | 0.5 – 10 |
| Erő | N | 100 – 10 000 |
| Young-modulus $E$ | Pa | 1e9 – 210e9 |
| Feszültség | Pa | 1e3 – 1e9 |
| Elmozdulás | m | 1e-9 – 1e-3 |

---

## 8. Elméleti korlátok, ismert hibák

| Jelenség | Ok | Kezelés |
|---|---|---|
| A CST merev a hajlásnál | lineáris alakfüggvény → konstans alakváltozás | finom háló; később T6 (kvadratikus) elem |
| Lépcsős lyukhatár csúcsa > 3σ₀ | szinguláris újramenet-sarkok | poligon-lyuk; nem hiba, hanem felbontási hatás |
| Poisson-locking vastag testeknél | $\nu \to 0.5$-nél $\mathbf{D}$ szinguláris | $\nu < 0.45$ korlát a UI-ban |
| Terhelés egyetlen csomóponton | szinguláris feszültségmező | oktatási céllal elfogadható; később elosztott terhelés (egyenértékű csomóponti erők) |

---

## 9. Irodalom

- O. C. Zienkiewicz, R. L. Taylor: *The Finite Element Method for Solid and Structural Mechanics*, 7th ed., Butterworth-Heinemann, 2013.
- K.-J. Bathe: *Finite Element Procedures*, Prentice Hall, 1996.
- J. N. Reddy: *An Introduction to the Finite Element Method*, 4th ed., McGraw-Hill, 2019.
- J. Shewchuk: *An Introduction to the Conjugate Gradient Method Without the Agonizing Pain*, CMU TR, 1994.
