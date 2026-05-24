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
const meshAutoSweepMaxAngle = Math.PI / 7;
const meshAutoSweepSpeed = 0.42;

const meshSections = [
  {
    id: "dl3dv",
    title: "DL3DV scenes",
    assets: [
      { group: "DL3DV", title: "DL3DV-5389", src: "./assets/mesh/gallery-web/dl3dv/additional/dl3dv-scene-09.ply.gz", viewMode: "top" },
      {
        group: "DL3DV",
        title: "DL3DV-e98f",
        src: "./assets/mesh/gallery-web/dl3dv/ba55c875d20c34ee85ffc72264c4d77710852e5fb7d9ce4b9c26a8442850e98f_ctx12_triangle_direct_q995.ply.gz",
        view: [0, 1],
      },
      { group: "DL3DV", title: "DL3DV-f70", src: "./assets/mesh/gallery-web/dl3dv/new_f70_DIRECT_triangle_mesh.ply.gz", view: [0, 1], frameScale: 0.72 },
      { group: "DL3DV", title: "DL3DV-7826", src: "./assets/mesh/gallery-web/dl3dv/additional/dl3dv-scene-08.ply.gz", viewMode: "top" },
      { group: "DL3DV", title: "DL3DV-374", src: "./assets/mesh/gallery-web/dl3dv/new_374_DIRECT_triangle_mesh.ply.gz", view: [0, 1] },
      { group: "DL3DV", title: "DL3DV-3b7f", src: "./assets/mesh/gallery-web/dl3dv/additional/dl3dv-scene-07.ply.gz", viewMode: "top" },
      { group: "DL3DV", title: "DL3DV-fae", src: "./assets/mesh/gallery-web/dl3dv/new_fae_DIRECT_triangle_mesh.ply.gz", view: [0, 1], cameraHeightScale: 0.62 },
      { group: "DL3DV", title: "DL3DV-a63f", src: "./assets/mesh/gallery-web/dl3dv/additional/dl3dv-scene-10.ply.gz", viewMode: "top" },
      { group: "DL3DV", title: "DL3DV-teaser", src: "./assets/mesh/gallery-web/dl3dv/teaser.ply.gz", view: [0, 1] },
      { group: "DL3DV", title: "DL3DV-0cb7", src: "./assets/mesh/gallery-web/dl3dv/additional/dl3dv-scene-12.ply.gz", viewMode: "top" },
      { group: "DL3DV", title: "DL3DV-9c5", src: "./assets/mesh/gallery-web/dl3dv/new_9c5_DIRECT_triangle_mesh.ply.gz", view: [0, 1] },
      { group: "DL3DV", title: "DL3DV-df35", src: "./assets/mesh/gallery-web/dl3dv/additional/dl3dv-scene-11.ply.gz", viewMode: "top" },
    ],
  },
  {
    id: "re10k",
    title: "RE10K scenes",
    assets: [
      { group: "RE10K", title: "RE10K-81e5", src: "./assets/mesh/gallery-web/re10k/05_5907e099d74681e5_triangle_direct_q995.ply.gz" },
      { group: "RE10K", title: "RE10K-cff8", src: "./assets/mesh/gallery-web/re10k/10_7a874ba9dd12cff8_triangle_direct_q995.ply.gz", view: [0, 1] },
      { group: "RE10K", title: "RE10K-6d14", src: "./assets/mesh/gallery-web/re10k/12_a46f4561a9bb6d14_triangle_direct_q995.ply.gz", viewFlip: true },
      { group: "RE10K", title: "RE10K-a616", src: "./assets/mesh/gallery-web/re10k/20_6054a3584527a616_triangle_direct_q995.ply.gz" },
      { group: "RE10K", title: "RE10K-63b", src: "./assets/mesh/gallery-web/re10k/new_DIRECT_triangle_mesh_63b.ply.gz" },
      { group: "RE10K", title: "RE10K-b56", src: "./assets/mesh/gallery-web/re10k/new_DIRECT_triangle_mesh_b56.ply.gz", viewFlip: true },
      { group: "RE10K", title: "RE10K-dab", src: "./assets/mesh/gallery-web/re10k/new_DIRECT_triangle_mesh_dab.ply.gz", viewFlip: true },
      { group: "RE10K", title: "RE10K-5ac", src: "./assets/mesh/gallery-web/re10k/new_DIRECT_triangle_mesh_new_5ac.ply.gz", viewFlip: true },
    ],
  },
];

function maxPixelRatio() {
  return Math.min(window.devicePixelRatio || 1, window.innerWidth < 760 ? 1.05 : 1.25);
}

function createMeshCard(asset) {
  const card = document.createElement("article");
  card.className = "mesh-card reveal";
  const sources = Array.isArray(asset.src) ? asset.src : [asset.src];
  card.dataset.src = sources[0];
  card.dataset.srcs = JSON.stringify(sources);
  if (asset.view) {
    card.dataset.viewX = String(asset.view[0]);
    card.dataset.viewZ = String(asset.view[1]);
  }
  if (asset.viewFlip) {
    card.dataset.viewFlip = "true";
  }
  if (asset.viewMode) {
    card.dataset.viewMode = asset.viewMode;
  }
  if (asset.frameScale) {
    card.dataset.frameScale = String(asset.frameScale);
  }
  if (asset.cameraHeightScale) {
    card.dataset.cameraHeightScale = String(asset.cameraHeightScale);
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

function progressPercent(loaded, total) {
  if (!Number.isFinite(loaded) || !Number.isFinite(total) || total <= 0) return null;
  return Math.min(100, Math.max(0, Math.round((loaded / total) * 100)));
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

async function decompressGzipBuffer(buffer) {
  if (!("DecompressionStream" in window)) {
    throw new Error("This browser cannot decompress gzip mesh assets");
  }
  const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).arrayBuffer();
}

function isGzipBuffer(buffer) {
  if (!buffer || buffer.byteLength < 2) return false;
  const bytes = new Uint8Array(buffer, 0, 2);
  return bytes[0] === 0x1f && bytes[1] === 0x8b;
}

async function maybeDecompressMeshBuffer(buffer, url) {
  if (!url.endsWith(".gz") || !isGzipBuffer(buffer)) return buffer;
  return decompressGzipBuffer(buffer);
}

async function loadPlyGeometry(loader, url, onProgress) {
  let lastError = null;

  for (let attempt = 1; attempt <= meshLoadAttempts; attempt += 1) {
    try {
      const buffer = await fetchArrayBufferWithProgress(url, onProgress);
      const plyBuffer = await maybeDecompressMeshBuffer(buffer, url);
      await waitForBrowserIdle();
      return loader.parse(plyBuffer);
    } catch (error) {
      lastError = error;
      if (attempt < meshLoadAttempts) await delay(650);
    }
  }

  throw lastError;
}

function geometrySources(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    return [value];
  }
  return [value];
}

async function loadPlyGeometryParts(loader, urls, onProgress) {
  const sources = geometrySources(urls);
  const geometries = [];
  for (const [index, url] of sources.entries()) {
    const geometry = await loadPlyGeometry(loader, url, (loaded, total) => {
      onProgress?.(index, sources.length, loaded, total);
    });
    geometries.push(geometry);
  }
  return geometries;
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

function finalizeGeometry(geometry) {
  geometry.computeVertexNormals();
  if (geometry.attributes.color) {
    geometry.attributes.color.normalized = true;
  }
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
}

function boundingBoxForGeometries(geometries) {
  const box = new THREE.Box3();
  for (const geometry of geometries) {
    geometry.computeBoundingBox();
    box.union(geometry.boundingBox);
  }
  return box;
}

function boundingSphereRadiusForBox(box) {
  const size = new THREE.Vector3();
  box.getSize(size);
  return size.length() * 0.5;
}

function estimateFloorHeight(geometries) {
  const box = boundingBoxForGeometries(geometries);
  const sceneHeight = Math.max(box.max.y - box.min.y, 1);
  const floorBandLimit = box.min.y + sceneHeight * 0.36;
  const heights = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  const normal = new THREE.Vector3();

  for (const geometry of geometries) {
    const position = geometry.attributes.position;
    const index = geometry.index;
    const faceCount = index ? index.count / 3 : Math.floor(position.count / 3);
    const step = Math.max(1, Math.floor(faceCount / 18000));

    for (let face = 0; face < faceCount; face += step) {
      const ia = index ? index.getX(face * 3) : face * 3;
      const ib = index ? index.getX(face * 3 + 1) : face * 3 + 1;
      const ic = index ? index.getX(face * 3 + 2) : face * 3 + 2;
      a.fromBufferAttribute(position, ia);
      b.fromBufferAttribute(position, ib);
      c.fromBufferAttribute(position, ic);
      normal.copy(ab.subVectors(b, a)).cross(ac.subVectors(c, a));
      if (normal.lengthSq() < 1e-10) continue;
      normal.normalize();
      if (Math.abs(normal.y) < 0.46) continue;
      const y = (a.y + b.y + c.y) / 3;
      if (y <= floorBandLimit) heights.push(y);
    }
  }

  if (heights.length < 8) return null;
  heights.sort((left, right) => left - right);
  return heights[Math.floor((heights.length - 1) * 0.18)];
}

function cropGeometryBelowY(geometry, minY) {
  const position = geometry.attributes.position;
  const sourceIndex = geometry.index;
  const faceCount = sourceIndex ? sourceIndex.count / 3 : Math.floor(position.count / 3);
  const oldToNew = new Map();
  const oldIndices = [];
  const remappedIndices = [];
  let keptFaces = 0;

  const mapIndex = (source) => {
    let mapped = oldToNew.get(source);
    if (mapped !== undefined) return mapped;
    mapped = oldIndices.length;
    oldToNew.set(source, mapped);
    oldIndices.push(source);
    return mapped;
  };

  for (let face = 0; face < faceCount; face += 1) {
    const ia = sourceIndex ? sourceIndex.getX(face * 3) : face * 3;
    const ib = sourceIndex ? sourceIndex.getX(face * 3 + 1) : face * 3 + 1;
    const ic = sourceIndex ? sourceIndex.getX(face * 3 + 2) : face * 3 + 2;
    const ay = position.getY(ia);
    const by = position.getY(ib);
    const cy = position.getY(ic);
    if (Math.max(ay, by, cy) < minY || (ay + by + cy) / 3 < minY) continue;
    remappedIndices.push(mapIndex(ia), mapIndex(ib), mapIndex(ic));
    keptFaces += 1;
  }

  if (!keptFaces || keptFaces === faceCount) return null;

  const cropped = new THREE.BufferGeometry();
  for (const [name, attribute] of Object.entries(geometry.attributes)) {
    const SourceArray = attribute.array.constructor;
    const itemSize = attribute.itemSize;
    const targetArray = new SourceArray(oldIndices.length * itemSize);
    for (let target = 0; target < oldIndices.length; target += 1) {
      const source = oldIndices[target];
      const sourceOffset = source * itemSize;
      const targetOffset = target * itemSize;
      for (let item = 0; item < itemSize; item += 1) {
        targetArray[targetOffset + item] = attribute.array[sourceOffset + item];
      }
    }
    cropped.setAttribute(name, new THREE.BufferAttribute(targetArray, itemSize, attribute.normalized));
  }
  cropped.setIndex(new THREE.BufferAttribute(new Uint32Array(remappedIndices), 1));
  geometry.dispose();
  return cropped;
}

function cropGeometriesBelowFloor(geometries) {
  const floorHeight = estimateFloorHeight(geometries);
  if (!Number.isFinite(floorHeight)) return;
  const minY = floorHeight - 0.035;

  for (let index = 0; index < geometries.length; index += 1) {
    geometries[index] = cropGeometryBelowY(geometries[index], minY) ?? geometries[index];
  }

  const croppedBox = boundingBoxForGeometries(geometries);
  for (const geometry of geometries) {
    geometry.translate(0, -croppedBox.min.y, 0);
  }
}

function estimateDominantUpNormal(geometries) {
  const accumulated = new THREE.Vector3();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  const normal = new THREE.Vector3();

  for (const geometry of geometries) {
    const position = geometry.attributes.position;
    const index = geometry.index;
    const faceCount = index ? index.count / 3 : Math.floor(position.count / 3);
    const step = Math.max(1, Math.floor(faceCount / 50000));

    for (let face = 0; face < faceCount; face += step) {
      const ia = index ? index.getX(face * 3) : face * 3;
      const ib = index ? index.getX(face * 3 + 1) : face * 3 + 1;
      const ic = index ? index.getX(face * 3 + 2) : face * 3 + 2;
      a.fromBufferAttribute(position, ia);
      b.fromBufferAttribute(position, ib);
      c.fromBufferAttribute(position, ic);
      normal.copy(ab.subVectors(b, a)).cross(ac.subVectors(c, a));
      if (normal.lengthSq() < 1e-10) continue;
      normal.normalize();
      if (normal.y < 0) normal.multiplyScalar(-1);
      if (normal.y < 0.18) continue;
      accumulated.addScaledVector(normal, Math.max(normal.y, 0.25));
    }
  }

  if (accumulated.lengthSq() < 1e-8) return new THREE.Vector3(0, 1, 0);
  return accumulated.normalize();
}

function levelGeometriesToGroundPlane(geometries) {
  const dominantUp = estimateDominantUpNormal(geometries);
  const worldUp = new THREE.Vector3(0, 1, 0);
  if (dominantUp.dot(worldUp) > 0.997) return;
  const rotation = new THREE.Quaternion().setFromUnitVectors(dominantUp, worldUp);
  for (const geometry of geometries) {
    geometry.applyQuaternion(rotation);
    geometry.deleteAttribute("normal");
  }
}

function normalizeGeometries(geometries) {
  for (const geometry of geometries) orientGeometryYUp(geometry);
  levelGeometriesToGroundPlane(geometries);

  const box = boundingBoxForGeometries(geometries);
  const center = new THREE.Vector3();
  const size = new THREE.Vector3();
  box.getCenter(center);
  box.getSize(size);
  const maxAxis = Math.max(size.x, size.y, size.z) || 1;
  const scale = 2.35 / maxAxis;

  for (const geometry of geometries) {
    geometry.translate(-center.x, -center.y, -center.z);
    geometry.scale(scale, scale, scale);
  }

  const scaledBox = boundingBoxForGeometries(geometries);
  const scaledCenter = new THREE.Vector3();
  const scaledSize = new THREE.Vector3();
  scaledBox.getCenter(scaledCenter);
  scaledBox.getSize(scaledSize);
  for (const geometry of geometries) {
    geometry.translate(-scaledCenter.x, -scaledBox.min.y, -scaledCenter.z);
  }
  cropGeometriesBelowFloor(geometries);

  for (const geometry of geometries) finalizeGeometry(geometry);

  return scaledSize.length();
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
    this.urls = geometrySources(card.dataset.srcs ?? card.dataset.src);
    this.preferredViewDirection = null;
    const preferredViewX = Number(card.dataset.viewX);
    const preferredViewZ = Number(card.dataset.viewZ);
    if (Number.isFinite(preferredViewX) && Number.isFinite(preferredViewZ)) {
      this.preferredViewDirection = { x: preferredViewX, z: preferredViewZ };
    }
    this.flipInitialView = card.dataset.viewFlip === "true";
    this.viewMode = card.dataset.viewMode || "orbit";
    this.frameScale = Number(card.dataset.frameScale) || 1;
    this.cameraHeightScale = Number(card.dataset.cameraHeightScale) || 1;
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
    this.autoSweepActive = false;
    this.autoSweepPhase = 0;
    this.autoSweepLastTime = 0;
    this.autoSweepBaseOffset = null;

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
    this.controls.autoRotate = false;
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
    this.controls.addEventListener("start", () => this.pauseAutoSweep());
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
    this.resumeAutoSweep();
    this.requestFrame();
  }

  resumeAutoSweep() {
    if (prefersReducedMotion || !this.initialCameraOffset) {
      this.autoSweepActive = false;
      return;
    }
    this.autoSweepActive = true;
    this.autoSweepPhase = 0;
    this.autoSweepLastTime = 0;
    this.autoSweepBaseOffset = this.initialCameraOffset.clone();
  }

  pauseAutoSweep() {
    this.autoSweepActive = false;
  }

  updateAutoSweep(now) {
    if (!this.autoSweepActive || !this.focusTarget || !this.autoSweepBaseOffset || !this.camera || !this.controls) return;
    const delta = this.autoSweepLastTime ? Math.min((now - this.autoSweepLastTime) / 1000, 0.12) : 0;
    this.autoSweepLastTime = now;
    this.autoSweepPhase += delta * meshAutoSweepSpeed;

    const angle = Math.sin(this.autoSweepPhase) * meshAutoSweepMaxAngle;
    const offset = this.autoSweepBaseOffset
      .clone()
      .applyAxisAngle(new THREE.Vector3(0, 1, 0), angle);
    this.controls.target.copy(this.focusTarget);
    this.camera.position.copy(this.focusTarget).add(offset);
    this.camera.lookAt(this.focusTarget);
  }

  setMode(mode) {
    if (!mode || !THREE) return;
    this.mode = mode;
    this.modeButtons.forEach((button) => {
      button.classList.toggle("is-active", button.dataset.mode === mode);
    });
    if (!this.mesh) return;
    this.mesh.traverse((object) => {
      if (!object.isMesh) return;
      const oldMaterial = object.material;
      object.material = createMaterial(this.mode);
      oldMaterial.dispose();
    });
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
    if (!(await this.init()) || !this.urls.length) {
      this.started = false;
      return;
    }
    this.showStatus("Loading mesh...");

    try {
      const geometries = await loadPlyGeometryParts(this.loader, this.urls, (partIndex, partCount, loaded, total) => {
        const percent = progressPercent(loaded, total);
        if (percent === null) return;
        const prefix = partCount > 1 ? `Part ${partIndex + 1}/${partCount} · ` : "";
        this.showStatus(`${prefix}Loading ${percent}%`);
      });

      const diagonal = normalizeGeometries(geometries);
      this.mesh = new THREE.Group();
      for (const geometry of geometries) {
        this.mesh.add(new THREE.Mesh(geometry, createMaterial(this.mode)));
      }
      this.scene.add(this.mesh);

      const sceneBox = boundingBoxForGeometries(geometries);
      const sceneCenter = new THREE.Vector3();
      const sceneSize = new THREE.Vector3();
      sceneBox.getCenter(sceneCenter);
      sceneBox.getSize(sceneSize);
      this.focusTarget = new THREE.Vector3(
        sceneCenter.x,
        sceneBox.min.y + sceneSize.y * 0.4,
        sceneCenter.z,
      );
      const radius = boundingSphereRadiusForBox(sceneBox);
      this.fitDistance = fitDistanceForBox(sceneSize, radius) * this.frameScale;
      if (this.viewMode === "top") {
        const topDistance = Math.max(this.fitDistance * 1.34, Math.max(sceneSize.x, sceneSize.z) * 1.32);
        this.openViewDirection = new THREE.Vector3(0, 0, 1);
        this.initialCameraOffset = new THREE.Vector3(0, topDistance, topDistance * 0.08);
      } else {
        const chosenViewDirection = this.preferredViewDirection
          ? new THREE.Vector3(this.preferredViewDirection.x, 0, this.preferredViewDirection.z).normalize()
          : estimateOpenView(geometries[0]);
        if (this.flipInitialView) chosenViewDirection.multiplyScalar(-1);
        this.openViewDirection = chosenViewDirection.normalize();
        const lateralOffset = new THREE.Vector3(-this.openViewDirection.z, 0, this.openViewDirection.x)
          .multiplyScalar(this.fitDistance * 0.08);
        this.initialCameraOffset = this.openViewDirection
          .clone()
          .multiplyScalar(this.fitDistance)
          .add(lateralOffset)
          .add(new THREE.Vector3(0, Math.max(sceneSize.y * 0.42, this.fitDistance * 0.18) * this.cameraHeightScale, 0));
      }
      this.resetCamera();

      const vertices = geometries.reduce((sum, geometry) => sum + geometry.attributes.position.count, 0);
      const faces = geometries.reduce((sum, geometry) => sum + (geometry.index ? geometry.index.count / 3 : geometry.attributes.position.count / 3), 0);
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
    this.updateAutoSweep(now);
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
