const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const revealObserver = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        revealObserver.unobserve(entry.target);
      }
    }
  },
  { rootMargin: "0px 0px -8% 0px", threshold: 0.12 },
);

document.querySelectorAll(".reveal").forEach((element) => {
  if (prefersReducedMotion) {
    element.classList.add("is-visible");
  } else {
    revealObserver.observe(element);
  }
});

const bibtexButton = document.querySelector("#copyBibtex");
const bibtexCode = document.querySelector("#bibtexCode");

bibtexButton?.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(bibtexCode.textContent.trim());
    bibtexButton.textContent = "Copied";
    window.setTimeout(() => {
      bibtexButton.textContent = "Copy";
    }, 1500);
  } catch {
    bibtexButton.textContent = "Select text";
  }
});

let THREE = null;
let OrbitControls = null;
let PLYLoader = null;
let modulesPromise = null;
let activeMeshLoads = 0;
const meshLoadQueue = [];
const maxConcurrentMeshLoads = 1;
const meshLoadAttempts = 2;

const meshSections = [
  {
    id: "outdoor",
    title: "Outdoor scenes",
    assets: [
      {
        group: "DL3DV",
        title: "Scene BA55",
        src: "./assets/mesh/gallery-web/dl3dv/ba55c875d20c34ee85ffc72264c4d77710852e5fb7d9ce4b9c26a8442850e98f_ctx12_triangle_direct_q995.ply",
        view: [0, 1],
      },
      { group: "DL3DV", title: "Scene F70", src: "./assets/mesh/gallery-web/dl3dv/new_f70_DIRECT_triangle_mesh.ply", view: [0, 1], frameScale: 0.72 },
      { group: "DL3DV", title: "Scene FAE", src: "./assets/mesh/gallery-web/dl3dv/new_fae_DIRECT_triangle_mesh.ply", view: [0, 1] },
      { group: "DL3DV", title: "Teaser Scene", src: "./assets/mesh/gallery-web/dl3dv/teaser.ply", view: [0, 1] },
    ],
  },
  {
    id: "indoor-dl3dv",
    title: "Indoor scenes",
    assets: [
      { group: "DL3DV", title: "Scene 374", src: "./assets/mesh/gallery-web/dl3dv/new_374_DIRECT_triangle_mesh.ply", view: [0, 1] },
      { group: "DL3DV", title: "Scene 9C5", src: "./assets/mesh/gallery-web/dl3dv/new_9c5_DIRECT_triangle_mesh.ply", view: [0, 1] },
      { group: "RE10K", title: "Scene 05", src: "./assets/mesh/gallery-web/re10k/05_5907e099d74681e5_triangle_direct_q995.ply", viewFlip: true },
      { group: "RE10K", title: "Scene 10", src: "./assets/mesh/gallery-web/re10k/10_7a874ba9dd12cff8_triangle_direct_q995.ply", view: [0, 1] },
      { group: "RE10K", title: "Scene 12", src: "./assets/mesh/gallery-web/re10k/12_a46f4561a9bb6d14_triangle_direct_q995.ply", viewFlip: true },
      { group: "RE10K", title: "Scene 20", src: "./assets/mesh/gallery-web/re10k/20_6054a3584527a616_triangle_direct_q995.ply", viewFlip: true },
      { group: "RE10K", title: "Scene 63B", src: "./assets/mesh/gallery-web/re10k/new_DIRECT_triangle_mesh_63b.ply", viewFlip: true },
      { group: "RE10K", title: "Scene B56", src: "./assets/mesh/gallery-web/re10k/new_DIRECT_triangle_mesh_b56.ply", viewFlip: true },
      { group: "RE10K", title: "Scene DAB", src: "./assets/mesh/gallery-web/re10k/new_DIRECT_triangle_mesh_dab.ply", viewFlip: true },
      { group: "RE10K", title: "Scene 5AC", src: "./assets/mesh/gallery-web/re10k/new_DIRECT_triangle_mesh_new_5ac.ply", viewFlip: true },
    ],
  },
];

function maxPixelRatio() {
  return Math.min(window.devicePixelRatio || 1, window.innerWidth < 760 ? 1.05 : 1.25);
}

function createMeshCard(asset) {
  const card = document.createElement("article");
  card.className = "mesh-card reveal";
  card.dataset.src = asset.src;
  if (asset.view) {
    card.dataset.viewX = String(asset.view[0]);
    card.dataset.viewZ = String(asset.view[1]);
  }
  if (asset.viewFlip) {
    card.dataset.viewFlip = "true";
  }
  if (asset.frameScale) {
    card.dataset.frameScale = String(asset.frameScale);
  }
  card.innerHTML = `
    <div class="mesh-card-header">
      <div>
        <h3>${asset.title}</h3>
        <span class="mesh-card-meta">${asset.group}</span>
      </div>
      <button class="button compact reset-view" type="button">Reset</button>
    </div>
    <div class="mesh-frame">
      <canvas class="mesh-canvas" aria-label="Interactive ${asset.group} ${asset.title} mesh viewer"></canvas>
      <div class="viewer-status">Loading mesh...</div>
      <div class="viewer-hud" aria-hidden="true">
        <span class="mesh-stats">Vertices · Faces</span>
        <span>PLY · local asset</span>
      </div>
    </div>
    <div class="segmented" role="group" aria-label="${asset.title} render mode">
      <button class="mode-button is-active" type="button" data-mode="textured">Textured</button>
      <button class="mode-button" type="button" data-mode="clay">Clay</button>
    </div>
  `;
  return card;
}

function pumpMeshLoadQueue() {
  while (activeMeshLoads < maxConcurrentMeshLoads && meshLoadQueue.length) {
    const job = meshLoadQueue.shift();
    activeMeshLoads += 1;
    job.viewer.loadMesh()
      .then(job.resolve)
      .catch(job.reject)
      .finally(() => {
        activeMeshLoads -= 1;
        pumpMeshLoadQueue();
      });
  }
}

function enqueueMeshLoad(viewer) {
  return new Promise((resolve, reject) => {
    meshLoadQueue.push({ viewer, resolve, reject });
    pumpMeshLoadQueue();
  });
}

function delay(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function waitForBrowserIdle(timeout = 520) {
  return new Promise((resolve) => {
    if ("requestIdleCallback" in window) {
      window.requestIdleCallback(resolve, { timeout });
    } else {
      window.setTimeout(resolve, Math.min(timeout, 180));
    }
  });
}

async function fetchArrayBufferWithProgress(url, onProgress) {
  const response = await fetch(url, { cache: "force-cache" });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }

  const total = Number(response.headers.get("content-length")) || 0;
  if (!response.body) {
    const buffer = await response.arrayBuffer();
    onProgress?.(buffer.byteLength, total || buffer.byteLength);
    return buffer;
  }

  const reader = response.body.getReader();
  const chunks = [];
  let received = 0;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.byteLength;
    onProgress?.(received, total);
  }

  const merged = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return merged.buffer;
}

async function loadPlyGeometry(loader, url, onProgress) {
  let lastError = null;

  for (let attempt = 1; attempt <= meshLoadAttempts; attempt += 1) {
    try {
      const buffer = await fetchArrayBufferWithProgress(url, onProgress);
      await waitForBrowserIdle();
      return loader.parse(buffer);
    } catch (error) {
      lastError = error;
      if (attempt < meshLoadAttempts) await delay(650);
    }
  }

  throw lastError;
}

async function loadThreeModules() {
  if (THREE && OrbitControls && PLYLoader) return;
  modulesPromise ??= Promise.all([
    import("three"),
    import("./assets/vendor/three/examples/jsm/controls/OrbitControls.js"),
    import("./assets/vendor/three/examples/jsm/loaders/PLYLoader.js"),
  ]).then(([threeModule, controlsModule, loaderModule]) => {
    THREE = threeModule;
    OrbitControls = controlsModule.OrbitControls;
    PLYLoader = loaderModule.PLYLoader;
  });
  await modulesPromise;
}

function createMaterial(mode) {
  if (mode === "clay") {
    return new THREE.MeshStandardMaterial({
      color: 0xe8eee7,
      roughness: 0.68,
      metalness: 0.04,
      side: THREE.DoubleSide,
    });
  }

  return new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.78,
    metalness: 0.02,
    side: THREE.DoubleSide,
  });
}

function orientGeometryYUp(geometry) {
  const position = geometry.attributes.position;
  for (let index = 0; index < position.count; index += 1) {
    const y = position.getY(index);
    const z = position.getZ(index);
    position.setY(index, -y);
    position.setZ(index, -z);
  }
  position.needsUpdate = true;
  geometry.deleteAttribute("normal");
}

function normalizeGeometry(geometry) {
  orientGeometryYUp(geometry);
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  const center = new THREE.Vector3();
  const size = new THREE.Vector3();
  box.getCenter(center);
  box.getSize(size);

  geometry.translate(-center.x, -center.y, -center.z);

  const maxAxis = Math.max(size.x, size.y, size.z) || 1;
  const scale = 2.35 / maxAxis;
  geometry.scale(scale, scale, scale);

  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  const normalizedBox = geometry.boundingBox;
  const normalizedCenter = new THREE.Vector3();
  const normalizedSize = new THREE.Vector3();
  normalizedBox.getCenter(normalizedCenter);
  normalizedBox.getSize(normalizedSize);
  geometry.translate(-normalizedCenter.x, -normalizedBox.min.y, -normalizedCenter.z);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  geometry.computeVertexNormals();

  if (geometry.attributes.color) {
    geometry.attributes.color.normalized = true;
  }

  return normalizedSize.length();
}

function estimateOpenView(geometry) {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  const position = geometry.attributes.position;
  const center = new THREE.Vector3();
  const size = new THREE.Vector3();
  box.getCenter(center);
  box.getSize(size);

  const directions = [
    new THREE.Vector3(0, 0, 1),
    new THREE.Vector3(1, 0, 1).normalize(),
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(1, 0, -1).normalize(),
    new THREE.Vector3(0, 0, -1),
    new THREE.Vector3(-1, 0, -1).normalize(),
    new THREE.Vector3(-1, 0, 0),
    new THREE.Vector3(-1, 0, 1).normalize(),
  ];
  const step = Math.max(1, Math.floor(position.count / 36000));
  const samples = [];
  const topY = box.min.y + size.y * 0.92;
  const lowY = box.min.y + size.y * 0.12;

  for (let index = 0; index < position.count; index += step) {
    const y = position.getY(index);
    if (y > topY || y < lowY) continue;
    samples.push(position.getX(index) - center.x, y - center.y, position.getZ(index) - center.z);
  }

  if (samples.length < 24) return new THREE.Vector3(0, 0, 1);

  let bestDirection = directions[0];
  let bestScore = Infinity;

  for (const direction of directions) {
    const rightX = -direction.z;
    const rightZ = direction.x;
    let minDepth = Infinity;
    let maxDepth = -Infinity;
    let maxLateral = 0;

    for (let index = 0; index < samples.length; index += 3) {
      const x = samples[index];
      const z = samples[index + 2];
      const depth = x * direction.x + z * direction.z;
      const lateral = Math.abs(x * rightX + z * rightZ);
      minDepth = Math.min(minDepth, depth);
      maxDepth = Math.max(maxDepth, depth);
      maxLateral = Math.max(maxLateral, lateral);
    }

    const depthRange = Math.max(maxDepth - minDepth, 0.001);
    const lateralRange = Math.max(maxLateral, 0.001);
    const nearStart = maxDepth - depthRange * 0.18;
    const innerStart = maxDepth - depthRange * 0.58;
    const innerEnd = maxDepth - depthRange * 0.22;
    let nearCentral = 0;
    let nearAll = 0;
    let innerCentral = 0;

    for (let index = 0; index < samples.length; index += 3) {
      const x = samples[index];
      const z = samples[index + 2];
      const depth = x * direction.x + z * direction.z;
      const lateral = Math.abs(x * rightX + z * rightZ);
      if (depth > nearStart) {
        nearAll += 1;
        if (lateral < lateralRange * 0.46) nearCentral += 1;
      } else if (depth > innerStart && depth < innerEnd && lateral < lateralRange * 0.58) {
        innerCentral += 1;
      }
    }

    const total = samples.length / 3;
    const score = (nearCentral * 1.55 + nearAll * 0.24) / total - (innerCentral / total) * 0.18;
    if (score < bestScore) {
      bestScore = score;
      bestDirection = direction;
    }
  }

  return bestDirection.clone().normalize();
}

function fitDistanceForBox(size, fallbackRadius) {
  const fov = THREE.MathUtils.degToRad(42);
  const assumedAspect = 1.22;
  const horizontal = Math.max(size.x, size.z, 0.001);
  const vertical = Math.max(size.y, 0.001);
  const fitWidth = horizontal / (2 * Math.tan(fov / 2) * assumedAspect * 0.84);
  const fitHeight = vertical / (2 * Math.tan(fov / 2) * 0.72);
  return Math.max(1.85, fitWidth, fitHeight, fallbackRadius * 1.42);
}

class MeshViewer {
  constructor(card) {
    this.card = card;
    this.canvas = card.querySelector(".mesh-canvas");
    this.statusEl = card.querySelector(".viewer-status");
    this.statsEl = card.querySelector(".mesh-stats");
    this.modeButtons = [...card.querySelectorAll(".mode-button")];
    this.resetButton = card.querySelector(".reset-view");
    this.url = card.dataset.src;
    this.preferredViewDirection = null;
    const preferredViewX = Number(card.dataset.viewX);
    const preferredViewZ = Number(card.dataset.viewZ);
    if (Number.isFinite(preferredViewX) && Number.isFinite(preferredViewZ)) {
      this.preferredViewDirection = { x: preferredViewX, z: preferredViewZ };
    }
    this.flipInitialView = card.dataset.viewFlip === "true";
    this.frameScale = Number(card.dataset.frameScale) || 1;
    this.mode = "textured";
    this.fitDistance = 3.2;
    this.focusTarget = null;
    this.initialCameraOffset = null;
    this.openViewDirection = null;
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.controls = null;
    this.loader = null;
    this.mesh = null;
    this.frame = 0;
    this.inViewport = false;
    this.started = false;
    this.starting = false;
    this.lastRenderTime = 0;
    this.releaseTimer = 0;
    this.savedCameraPosition = null;
    this.savedControlsTarget = null;

    this.modeButtons.forEach((button) => {
      button.addEventListener("click", () => this.setMode(button.dataset.mode));
    });
    this.resetButton?.addEventListener("click", () => this.resetCamera());
  }

  showStatus(message, isError = false) {
    if (!this.statusEl) return;
    this.statusEl.textContent = message;
    this.statusEl.classList.toggle("is-error", isError);
    this.statusEl.classList.remove("is-hidden");
  }

  hideStatus() {
    this.statusEl?.classList.add("is-hidden");
  }

  async init() {
    if (!this.canvas) return false;

    try {
      await loadThreeModules();
    } catch (error) {
      console.error(error);
      this.showStatus("Three.js is unavailable", true);
      return false;
    }

    if (!this.scene) this.createScene();
    return this.ensureRenderer();
  }

  createScene() {
    if (this.scene) return;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x020506);
    this.scene.fog = new THREE.FogExp2(0x071114, 0.02);

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.01, 1000);
    this.camera.position.set(0, 1.15, 3.2);

    const keyLight = new THREE.DirectionalLight(0xffffff, 2.6);
    keyLight.position.set(3, 4, 5);
    this.scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0x8bb7ff, 1.22);
    fillLight.position.set(-4, 2, -3);
    this.scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xffcf70, 1.55);
    rimLight.position.set(0, 3.5, -5);
    this.scene.add(rimLight);

    this.scene.add(new THREE.HemisphereLight(0xbfffee, 0x071114, 1.3));

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(3.8, 96),
      new THREE.MeshBasicMaterial({
        color: 0x58e0c2,
        transparent: true,
        opacity: 0.045,
        side: THREE.DoubleSide,
      }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.018;
    this.scene.add(ground);

    this.loader = new PLYLoader();
  }

  ensureRenderer() {
    if (this.renderer) return true;

    try {
      this.renderer = new THREE.WebGLRenderer({
        canvas: this.canvas,
        antialias: false,
        alpha: true,
        powerPreference: "high-performance",
      });
    } catch (error) {
      console.error(error);
      this.showStatus("WebGL is unavailable", true);
      return false;
    }

    this.renderer.setPixelRatio(maxPixelRatio());
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.autoRotate = !prefersReducedMotion;
    this.controls.autoRotateSpeed = 0.46;
    this.controls.screenSpacePanning = true;
    this.controls.enablePan = true;
    this.controls.target.set(0, 0, 0);
    this.controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.PAN,
    };
    this.controls.touches = {
      ONE: THREE.TOUCH.ROTATE,
      TWO: THREE.TOUCH.DOLLY_PAN,
    };
    this.canvas.style.touchAction = "none";

    if (this.savedControlsTarget) this.controls.target.copy(this.savedControlsTarget);
    if (this.savedCameraPosition) this.camera.position.copy(this.savedCameraPosition);
    this.controls.update();

    return true;
  }

  releaseRenderer() {
    if (this.frame) {
      cancelAnimationFrame(this.frame);
      this.frame = 0;
    }

    if (this.controls) {
      this.savedControlsTarget = this.controls.target.clone();
      this.controls.dispose();
      this.controls = null;
    }

    if (this.camera) {
      this.savedCameraPosition = this.camera.position.clone();
    }

    if (this.renderer) {
      this.renderer.dispose();
      this.renderer.forceContextLoss();
      this.renderer = null;
    }

    const replacementCanvas = this.canvas.cloneNode(false);
    replacementCanvas.style.touchAction = "none";
    this.canvas.replaceWith(replacementCanvas);
    this.canvas = replacementCanvas;
  }

  resetCamera() {
    if (!this.camera || !this.controls) return;
    const target = this.focusTarget ?? new THREE.Vector3(0, 0.5, 0);
    const offset = this.initialCameraOffset ?? new THREE.Vector3(0, this.fitDistance * 0.34, this.fitDistance);
    this.controls.target.copy(target);
    this.camera.position.copy(target).add(offset);
    this.camera.lookAt(target);
    this.controls.minDistance = this.fitDistance * 0.12;
    this.controls.maxDistance = this.fitDistance * 5.2;
    this.controls.panSpeed = 0.86;
    this.controls.update();
    this.requestFrame();
  }

  setMode(mode) {
    if (!mode || !THREE) return;
    this.mode = mode;
    this.modeButtons.forEach((button) => {
      button.classList.toggle("is-active", button.dataset.mode === mode);
    });
    if (!this.mesh) return;
    const oldMaterial = this.mesh.material;
    this.mesh.material = createMaterial(this.mode);
    oldMaterial.dispose();
    this.requestFrame();
  }

  updateRendererSize() {
    if (!this.renderer || !this.camera || !this.canvas) return;
    const { clientWidth, clientHeight } = this.canvas;
    const pixelRatio = maxPixelRatio();
    this.renderer.setPixelRatio(pixelRatio);
    if (
      this.canvas.width !== Math.round(clientWidth * pixelRatio) ||
      this.canvas.height !== Math.round(clientHeight * pixelRatio)
    ) {
      this.renderer.setSize(clientWidth, clientHeight, false);
      this.camera.aspect = clientWidth / Math.max(clientHeight, 1);
      this.camera.updateProjectionMatrix();
    }
  }

  async loadMesh() {
    if (!this.inViewport) {
      this.started = false;
      return;
    }
    if (!(await this.init()) || !this.url) {
      this.started = false;
      return;
    }
    this.showStatus("Loading mesh...");

    try {
      const geometry = await loadPlyGeometry(this.loader, this.url, (loaded, total) => {
        if (!total) return;
        this.showStatus(`Loading ${Math.round((loaded / total) * 100)}%`);
      });

      const diagonal = normalizeGeometry(geometry);
      this.mesh = new THREE.Mesh(geometry, createMaterial(this.mode));
      this.scene.add(this.mesh);

      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      const sceneBox = geometry.boundingBox;
      const sceneCenter = new THREE.Vector3();
      const sceneSize = new THREE.Vector3();
      sceneBox.getCenter(sceneCenter);
      sceneBox.getSize(sceneSize);
      this.focusTarget = new THREE.Vector3(
        sceneCenter.x,
        sceneBox.min.y + sceneSize.y * 0.4,
        sceneCenter.z,
      );
      const radius = geometry.boundingSphere?.radius ?? diagonal * 0.5;
      this.fitDistance = fitDistanceForBox(sceneSize, radius) * this.frameScale;
      const chosenViewDirection = this.preferredViewDirection
        ? new THREE.Vector3(this.preferredViewDirection.x, 0, this.preferredViewDirection.z).normalize()
        : estimateOpenView(geometry);
      if (this.flipInitialView) chosenViewDirection.multiplyScalar(-1);
      this.openViewDirection = chosenViewDirection.normalize();
      const lateralOffset = new THREE.Vector3(-this.openViewDirection.z, 0, this.openViewDirection.x)
        .multiplyScalar(this.fitDistance * 0.08);
      this.initialCameraOffset = this.openViewDirection
        .clone()
        .multiplyScalar(this.fitDistance)
        .add(lateralOffset)
        .add(new THREE.Vector3(0, Math.max(sceneSize.y * 0.42, this.fitDistance * 0.18), 0));
      this.resetCamera();

      const vertices = geometry.attributes.position.count;
      const faces = geometry.index ? geometry.index.count / 3 : vertices / 3;
      if (this.statsEl) {
        this.statsEl.textContent = `${vertices.toLocaleString()} vertices · ${Math.round(faces).toLocaleString()} faces`;
      }
      this.hideStatus();
      this.requestFrame();
    } catch (error) {
      console.error(error);
      this.showStatus("Could not load mesh", true);
      if (this.statsEl) this.statsEl.textContent = "Mesh unavailable";
    }
  }

  async start() {
    if (this.started || this.starting) return;
    this.starting = true;
    try {
      this.started = true;
      this.showStatus("Queued mesh...");
      await enqueueMeshLoad(this);
    } finally {
      this.starting = false;
    }
  }

  requestFrame() {
    if (this.frame || !this.inViewport || document.hidden || !this.renderer) return;
    this.frame = requestAnimationFrame((now) => this.animate(now));
  }

  animate(now = 0) {
    this.frame = 0;
    if (!this.renderer || !this.scene || !this.camera || !this.controls) return;
    if (!this.inViewport || document.hidden) return;
    if (now - this.lastRenderTime < 34) {
      this.requestFrame();
      return;
    }
    this.lastRenderTime = now;
    this.updateRendererSize();
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.requestFrame();
  }

  setViewportState(isVisible) {
    this.inViewport = isVisible;
    if (isVisible) {
      if (this.releaseTimer) {
        window.clearTimeout(this.releaseTimer);
        this.releaseTimer = 0;
      }
      this.start();
      if (this.mesh && !this.renderer) {
        this.init().then((ready) => {
          if (ready) this.requestFrame();
        });
      }
      this.requestFrame();
    } else {
      if (this.frame) {
        cancelAnimationFrame(this.frame);
        this.frame = 0;
      }
      if (this.renderer && !this.releaseTimer) {
        this.releaseTimer = window.setTimeout(() => {
          this.releaseTimer = 0;
          if (!this.inViewport) this.releaseRenderer();
        }, 900);
      }
    }
  }
}

const meshGrid = document.querySelector("#meshGrid");

if (meshGrid) {
  meshSections.forEach((section) => {
    const group = document.createElement("section");
    group.className = "mesh-group reveal";
    group.dataset.meshGroup = section.id;
    group.innerHTML = `
      <div class="mesh-group-heading">
        <h3>${section.title}</h3>
      </div>
      <div class="mesh-rail-shell">
        <div class="mesh-group-grid" aria-label="${section.title} viewers" tabindex="0"></div>
      </div>
    `;
    const grid = group.querySelector(".mesh-group-grid");
    section.assets.forEach((asset) => {
      grid.append(createMeshCard(asset));
    });
    meshGrid.append(group);
  });
}

document.querySelectorAll(".reveal").forEach((element) => {
  if (element.classList.contains("is-visible")) return;
  if (prefersReducedMotion) {
    element.classList.add("is-visible");
  } else {
    revealObserver.observe(element);
  }
});

const meshViewers = [...document.querySelectorAll(".mesh-card")].map((card) => new MeshViewer(card));

if (meshViewers.length) {
  const meshViewerObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        entry.target.__meshViewer?.setViewportState(entry.isIntersecting);
      }
    },
    { rootMargin: "420px 0px", threshold: 0.01 },
  );

  meshViewers.forEach((viewer) => {
    viewer.card.__meshViewer = viewer;
    meshViewerObserver.observe(viewer.card);
  });
}

document.addEventListener("visibilitychange", () => {
  meshViewers.forEach((viewer) => {
    if (document.hidden && viewer.frame) {
      cancelAnimationFrame(viewer.frame);
      viewer.frame = 0;
    } else {
      viewer.requestFrame();
    }
  });
});
