/**
 * WebGL (Three.js) renderer — csúcs-színes hőtérkép.
 *
 * A csúcsfeszültségek a környező elemek Von Mises értékeiből átlagolódnak
 * (a CST konstans elemi feszültségei folytonos mezővé simítva), a színezés
 * vertex szinten történik → folytonos átmenetek, szemben a Canvas 2D
 * elemenkénti lapos színeivel.
 *
 * Nézet: ortografikus kamera felülnézetből, OrbitControls (forgatás + zoom).
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { Mesh, SolutionResult } from '../fem/types';

export interface WebGLRenderOptions {
  deformationScale: number;
  stressMax: number;
  showMeshEdges: boolean;
  highlight?: number | null;
  highlightNode?: number | null;
  phase?: number;
}

/** Viridis színtérkép — a colormap.ts kontrolpontjai alapján, GPU-hoz 0..1 */
function viridisColor(t: number, out: THREE.Color): THREE.Color {
  // durva, de a GPU-megjelenítéshez elegendő polinom-közelítés
  const x = Math.min(1, Math.max(0, t));
  // a viridis 5 kontrolpontjának lineáris interpolációja
  const stops: Array<[number, number, number, number]> = [
    [0.0, 68, 1, 84],
    [0.25, 59, 82, 139],
    [0.5, 33, 145, 140],
    [0.75, 94, 201, 98],
    [1.0, 253, 231, 37],
  ];
  for (let i = 0; i < stops.length - 1; i++) {
    const [t0, r0, g0, b0] = stops[i]!;
    const [t1, r1, g1, b1] = stops[i + 1]!;
    if (x >= t0 && x <= t1) {
      const f = (x - t0) / (t1 - t0);
      out.setRGB(
        (r0 + f * (r1 - r0)) / 255,
        (g0 + f * (g1 - g0)) / 255,
        (b0 + f * (b1 - b0)) / 255,
      );
      return out;
    }
  }
  out.setRGB(253 / 255, 231 / 255, 37 / 255);
  return out;
}

export class WebGLRenderer {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.OrthographicCamera;
  private controls: OrbitControls;
  private meshGroup: THREE.Group | null = null;
  private canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
    });
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#0f172a');

    const aspect = canvas.width / Math.max(canvas.height, 1);
    const viewSize = 1.2;
    this.camera = new THREE.OrthographicCamera(
      -viewSize * aspect,
      viewSize * aspect,
      viewSize,
      -viewSize,
      0.01,
      100,
    );
    this.camera.position.set(0, 0, 10);
    this.camera.lookAt(0, 0, 0);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableRotate = true;
    this.controls.enableZoom = true;
    this.controls.enablePan = true;
    this.controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.PAN,
    };
  }

  /** Egy render-hívás világkoordinátáinak befoglaló mérete */
  private fitCamera(mesh: Mesh): void {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const n of mesh.nodes) {
      minX = Math.min(minX, n.x);
      maxX = Math.max(maxX, n.x);
      minY = Math.min(minY, n.y);
      maxY = Math.max(maxY, n.y);
    }
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const w = Math.max(maxX - minX, 1e-9);
    const h = Math.max(maxY - minY, 1e-9);
    const viewSize = Math.max(w, h) * 0.62;
    const aspect = this.canvas.width / Math.max(this.canvas.height, 1);
    this.camera.left = -viewSize * aspect;
    this.camera.right = viewSize * aspect;
    this.camera.top = viewSize;
    this.camera.bottom = -viewSize;
    this.camera.position.set(cx, cy, 10);
    this.camera.updateProjectionMatrix();
    this.controls.target.set(cx, cy, 0);
    this.controls.update();
  }

  render(mesh: Mesh, sol: SolutionResult, opts: WebGLRenderOptions): void {
    if (this.meshGroup) {
      this.scene.remove(this.meshGroup);
      this.meshGroup.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
          else o.material.dispose();
        }
      });
    }
    this.meshGroup = new THREE.Group();
    this.scene.add(this.meshGroup);

    const phase = opts.phase ?? 1;
    const nNodes = mesh.nodes.length;
    const positions = new Float32Array(nNodes * 3);
    const colors = new Float32Array(nNodes * 3);

    // Csúcsfeszültségek: a környező elemek VM-értékeinek átlaga
    const vmSum = new Float64Array(nNodes);
    const vmCount = new Float64Array(nNodes);
    for (const elem of mesh.elements) {
      const s = sol.stresses.get(elem.id);
      if (!s) continue;
      for (const nid of elem.nodes) {
        vmSum[nid] = vmSum[nid]! + s.vonMises;
        vmCount[nid] = vmCount[nid]! + 1;
      }
    }

    const color = new THREE.Color();
    for (const n of mesh.nodes) {
      const d = sol.displacements.get(n.id) ?? { x: 0, y: 0 };
      positions[n.id * 3] = n.x + d.x * opts.deformationScale * phase;
      positions[n.id * 3 + 1] = n.y + d.y * opts.deformationScale * phase;
      positions[n.id * 3 + 2] = 0;
      const vm = vmCount[n.id]! > 0 ? vmSum[n.id]! / vmCount[n.id]! : 0;
      viridisColor(vm / Math.max(opts.stressMax, 1e-12), color);
      colors[n.id * 3] = color.r;
      colors[n.id * 3 + 1] = color.g;
      colors[n.id * 3 + 2] = color.b;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    // Indexek: mindkét elem-típus ugyanazokat a SAROK-háromszögeket rajzolja;
    // T6-nál az oldalközép-csomópontok a színfolytonosságot javítják, ha
    // háromszögeljük velük is: 1 nagy = 4 kicsi háromszög (a,b,c + középekkel)
    const isT6 = (mesh.elementType ?? 'CST') === 'T6';
    const indices: number[] = [];
    for (const elem of mesh.elements) {
      const [a, b, c] = elem.nodes;
      if (!isT6 || elem.nodes.length < 6) {
        indices.push(a, b, c);
      } else {
        const mab = elem.nodes[3]!;
        const mbc = elem.nodes[4]!;
        const mca = elem.nodes[5]!;
        // 4 gyerek-háromszög (a sarok-közép felbontás)
        indices.push(a, mab, mca);
        indices.push(mab, b, mbc);
        indices.push(mab, mbc, mca);
        indices.push(mca, mbc, c);
      }
    }
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    const material = new THREE.MeshBasicMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
    });
    const surface = new THREE.Mesh(geometry, material);
    this.meshGroup.add(surface);

    // Elemhatárok (wireframe)
    if (opts.showMeshEdges) {
      const edgeMaterial = new THREE.LineBasicMaterial({
        color: 0x0f172a,
        transparent: true,
        opacity: 0.35,
      });
      const edgeGeometry = new THREE.WireframeGeometry(geometry);
      const edges = new THREE.LineSegments(edgeGeometry, edgeMaterial);
      this.meshGroup.add(edges);
    }

    this.fitCamera(mesh);
    this.renderer.render(this.scene, this.camera);
  }

  setSize(width: number, height: number): void {
    this.renderer.setSize(width, height, false);
    const aspect = width / Math.max(height, 1);
    const viewSize = this.camera.top;
    this.camera.left = -viewSize * aspect;
    this.camera.right = viewSize * aspect;
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    this.controls.dispose();
    this.renderer.dispose();
  }
}
