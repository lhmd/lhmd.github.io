import * as THREE from "three";
import { OrbitControls } from "./assets/vendor/three/examples/jsm/controls/OrbitControls.js";
import { PLYLoader } from "./assets/vendor/three/examples/jsm/loaders/PLYLoader.js";

const canvas = document.querySelector("#teaserCanvas");
const fpvCanvas = document.querySelector("#fpvCanvas");
const statusEl = document.querySelector("#teaserStatus");
const agentNameEl = document.querySelector("#teaserAgentName");
const speedEl = document.querySelector("#teaserSpeed");
const agentButtons = document.querySelectorAll(".agent-button");
const agentRosterEl = document.querySelector("#agentRoster");
const driveButtons = document.querySelectorAll(".drive-pad button");
const dropBeaconButton = document.querySelector("#dropBeacon");
const runtimeSceneSelect = document.querySelector("#runtimeSceneSelect");
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function progressPercent(loaded, total) {
  if (!Number.isFinite(loaded) || !Number.isFinite(total) || total <= 0) return null;
  return Math.min(100, Math.max(0, Math.round((loaded / total) * 100)));
}

if (!canvas) {
  throw new Error("Missing teaser canvas");
}

export function createTeaserPlayground() {

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: false,
  powerPreference: "high-performance",
});
renderer.setPixelRatio(maxPixelRatio());
renderer.outputColorSpace = THREE.SRGBColorSpace;

const fpvRenderer = fpvCanvas
  ? new THREE.WebGLRenderer({
      canvas: fpvCanvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    })
  : null;
fpvRenderer?.setPixelRatio(maxPixelRatio());
if (fpvRenderer) fpvRenderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x071114);
scene.fog = new THREE.FogExp2(0x071114, 0.036);

const worldCamera = new THREE.PerspectiveCamera(42, 1, 0.01, 1000);
worldCamera.position.set(0, 3.5, 6.2);

const fpvCamera = new THREE.PerspectiveCamera(62, 16 / 9, 0.01, 80);

const controls = new OrbitControls(worldCamera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.075;
controls.target.set(0, 0.55, 0);
controls.maxPolarAngle = Math.PI * 0.49;
controls.minDistance = 2.0;
controls.maxDistance = 11.0;

const clock = new THREE.Clock();
const raycaster = new THREE.Raycaster();
const groundRaycaster = new THREE.Raycaster();
const pointerKeys = new Set();
const beacons = [];
const agents = [];
const pointer = new THREE.Vector2();
const pointerDown = new THREE.Vector2();
const defaultSpawnPoints = [
  new THREE.Vector3(-0.65, 0.08, 0.62),
  new THREE.Vector3(0.1, 0.08, 0.48),
  new THREE.Vector3(0.68, 0.08, 0.7),
];
let spawnPoints = defaultSpawnPoints.map((point) => point.clone());

let activeAgent = null;
let sceneMesh = null;
let activeAgentType = "humanoid";
let currentVelocity = 0;
let targetYaw = 0;
let didStart = false;
let spawnIndex = 0;
let agentIdCounter = 0;
let pointerDownTime = 0;
let frameId = 0;
let isRunning = false;
let lastRenderTime = 0;
let meshLoadingPromise = null;
let readyResolve = null;
let readyReject = null;
let didSettleReady = false;
let readyPromise = new Promise((resolve, reject) => {
  readyResolve = resolve;
  readyReject = reject;
});
let sceneFloorHeight = 0.08;
let activeSceneScale = 1;

const loader = new PLYLoader();
const groundProbeOrigin = new THREE.Vector3();
const groundProbeDirection = new THREE.Vector3(0, -1, 0);
const sceneCenter = new THREE.Vector3(0, 0.7, 0);
const sceneMeshOffset = new THREE.Vector3(0, 0, -0.16);
const cameraFrameCenter = new THREE.Vector3(0, 0.7, 0);
const sceneDataCache = new Map();
const groundHeightCache = new Map();
const dl3dvAgentScale = 0.18;
const re10kAgentScale = 0.32;
const runtimeScenes = [
  {
    id: "dl3dv-1",
    label: "DL3DV-1",
    src: "./assets/mesh/gallery-web/dl3dv/ba55c875d20c34ee85ffc72264c4d77710852e5fb7d9ce4b9c26a8442850e98f_ctx12_triangle_direct_q995.ply.gz",
    agentScale: dl3dvAgentScale,
  },
  {
    id: "dl3dv-2",
    label: "DL3DV-2",
    src: "./assets/mesh/gallery-web/dl3dv/new_f70_DIRECT_triangle_mesh.ply.gz",
    agentScale: dl3dvAgentScale,
    frameScale: 0.72,
  },
  {
    id: "dl3dv-3",
    label: "DL3DV-3",
    src: "./assets/mesh/gallery-web/dl3dv/new_fae_DIRECT_triangle_mesh.ply.gz",
    agentScale: dl3dvAgentScale,
  },
  {
    id: "dl3dv-4",
    label: "DL3DV-4",
    src: "./assets/mesh/gallery-web/dl3dv/teaser.ply.gz",
    agentScale: dl3dvAgentScale,
  },
  {
    id: "dl3dv-5",
    label: "DL3DV-5",
    src: "./assets/mesh/gallery-web/dl3dv/new_374_DIRECT_triangle_mesh.ply.gz",
    agentScale: dl3dvAgentScale,
  },
  {
    id: "dl3dv-6",
    label: "DL3DV-6",
    src: "./assets/mesh/gallery-web/dl3dv/new_9c5_DIRECT_triangle_mesh.ply.gz",
    agentScale: dl3dvAgentScale,
  },
  {
    id: "dl3dv-7",
    label: "DL3DV-7",
    src: "./assets/mesh/gallery-web/dl3dv/additional/dl3dv-scene-07.ply.gz",
    agentScale: dl3dvAgentScale,
  },
  {
    id: "dl3dv-8",
    label: "DL3DV-8",
    src: "./assets/mesh/gallery-web/dl3dv/additional/dl3dv-scene-08.ply.gz",
    agentScale: dl3dvAgentScale,
  },
  {
    id: "dl3dv-9",
    label: "DL3DV-9",
    src: "./assets/mesh/gallery-web/dl3dv/additional/dl3dv-scene-09.ply.gz",
    agentScale: dl3dvAgentScale,
  },
  {
    id: "dl3dv-10",
    label: "DL3DV-10",
    src: "./assets/mesh/gallery-web/dl3dv/additional/dl3dv-scene-10.ply.gz",
    agentScale: dl3dvAgentScale,
  },
  {
    id: "dl3dv-11",
    label: "DL3DV-11",
    src: "./assets/mesh/gallery-web/dl3dv/additional/dl3dv-scene-11.ply.gz",
    agentScale: dl3dvAgentScale,
  },
  {
    id: "dl3dv-12",
    label: "DL3DV-12",
    src: "./assets/mesh/gallery-web/dl3dv/additional/dl3dv-scene-12.ply.gz",
    agentScale: dl3dvAgentScale,
  },
  {
    id: "re10k-1",
    label: "RE10K-1",
    src: "./assets/mesh/gallery-web/re10k/10_7a874ba9dd12cff8_triangle_direct_q995.ply.gz",
    agentScale: re10kAgentScale,
  },
  {
    id: "re10k-2",
    label: "RE10K-2",
    src: "./assets/mesh/gallery-web/re10k/new_DIRECT_triangle_mesh_63b.ply.gz",
    agentScale: re10kAgentScale,
  },
  {
    id: "re10k-3",
    label: "RE10K-3",
    src: "./assets/mesh/gallery-web/re10k/new_DIRECT_triangle_mesh_b56.ply.gz",
    agentScale: re10kAgentScale,
  },
];
let activeSceneId = runtimeScenes[0].id;
let sceneLoadToken = 0;

function maxPixelRatio() {
  return Math.min(window.devicePixelRatio || 1, window.innerWidth < 760 ? 1.1 : 1.4);
}

scene.add(new THREE.HemisphereLight(0xbfffee, 0x071114, 1.35));

const sun = new THREE.DirectionalLight(0xffffff, 2.6);
sun.position.set(4, 6, 3);
scene.add(sun);

const rim = new THREE.DirectionalLight(0xffcf70, 1.3);
rim.position.set(-4, 2.5, -4);
scene.add(rim);

const accent = new THREE.PointLight(0x58e0c2, 3.2, 6);
accent.position.set(-1.6, 1.2, 1.8);
scene.add(accent);

const activeMarker = new THREE.Group();
const markerRing = new THREE.Mesh(
  new THREE.TorusGeometry(0.44, 0.008, 8, 96),
  new THREE.MeshBasicMaterial({
    color: 0x58e0c2,
    transparent: true,
    opacity: 0.9,
  }),
);
markerRing.rotation.x = Math.PI / 2;
activeMarker.add(markerRing);
scene.add(activeMarker);

function showStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("is-error", isError);
  statusEl.classList.remove("is-hidden");
}

function hideStatus() {
  statusEl.classList.add("is-hidden");
}

function createSceneMaterial() {
  return new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: false,
    opacity: 1,
    wireframe: false,
    depthWrite: true,
    side: THREE.DoubleSide,
  });
}

function populateRuntimeScenes() {
  if (!runtimeSceneSelect) return;
  runtimeSceneSelect.replaceChildren(
    ...runtimeScenes.map((runtimeScene) => {
      const option = document.createElement("option");
      option.value = runtimeScene.id;
      option.textContent = runtimeScene.label;
      return option;
    }),
  );
  runtimeSceneSelect.value = activeSceneId;
}

function geometrySources(value) {
  return Array.isArray(value) ? value : [value].filter(Boolean);
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

async function loadPlyGeometry(url, onProgress) {
  const buffer = await fetchArrayBufferWithProgress(url, onProgress);
  const plyBuffer = url.endsWith(".gz") && isGzipBuffer(buffer) ? await decompressGzipBuffer(buffer) : buffer;
  return loader.parse(plyBuffer);
}

async function loadPlyGeometryParts(runtimeScene) {
  const sources = geometrySources(runtimeScene.src);
  const geometries = [];

  for (const [index, source] of sources.entries()) {
    const geometry = await loadPlyGeometry(source, (loaded, total) => {
      const percent = progressPercent(loaded, total);
      if (percent === null) return;
      const partLabel = sources.length > 1 ? ` ${index + 1}/${sources.length}` : "";
      showStatus(`Loading ${runtimeScene.label}${partLabel} ${percent}%`);
    });
    geometries.push(geometry);
  }

  return geometries;
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
  const scale = 4.2 / maxAxis;

  for (const geometry of geometries) {
    geometry.translate(-center.x, -center.y, -center.z);
    geometry.scale(scale, scale, scale);
  }

  const adjustedBox = boundingBoxForGeometries(geometries);
  const adjustedCenter = new THREE.Vector3();
  adjustedBox.getCenter(adjustedCenter);

  for (const geometry of geometries) {
    geometry.translate(-adjustedCenter.x, -adjustedBox.min.y, -adjustedCenter.z);
    finalizeGeometry(geometry);
  }

  return boundingBoxForGeometries(geometries);
}

function createCapsule(name, radius, length, color) {
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.58,
    metalness: 0.12,
    emissive: color,
    emissiveIntensity: 0.04,
  });
  const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(radius, length, 6, 10), material);
  mesh.name = name;
  mesh.castShadow = false;
  return mesh;
}

function createBox(name, size, color) {
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.62,
    metalness: 0.08,
    emissive: color,
    emissiveIntensity: 0.035,
  });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), material);
  mesh.name = name;
  return mesh;
}

function createHumanoid() {
  const group = new THREE.Group();
  group.userData.displayName = "Humanoid Robot";
  group.userData.height = 0.88;
  group.userData.cameraOffset = new THREE.Vector3(0, 0.72, 0.14);

  const torso = createCapsule("torso", 0.12, 0.34, 0x8bb7ff);
  torso.position.y = 0.47;
  group.add(torso);

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 14, 10),
    new THREE.MeshStandardMaterial({ color: 0xffcf70, roughness: 0.5, metalness: 0.16 }),
  );
  head.position.y = 0.78;
  group.add(head);

  const visor = createBox("visor", new THREE.Vector3(0.16, 0.035, 0.025), 0x071114);
  visor.position.set(0, 0.795, 0.105);
  group.add(visor);

  for (const x of [-0.12, 0.12]) {
    const arm = createCapsule("arm", 0.035, 0.34, 0x58e0c2);
    arm.position.set(x, 0.48, 0);
    arm.rotation.z = x < 0 ? 0.18 : -0.18;
    group.add(arm);

    const leg = createCapsule("leg", 0.04, 0.32, 0xe8eee7);
    leg.position.set(x * 0.52, 0.18, 0);
    group.add(leg);
  }

  return group;
}

function prepareAgent(group, type) {
  group.userData.agentType = type;
  group.userData.baseHeight = group.userData.height;
  group.userData.baseCameraOffset = group.userData.cameraOffset.clone();
  group.traverse((part) => {
    if (!part.isMesh) return;
    part.renderOrder = 4;
    part.userData.agentRoot = group;
    part.material.transparent = true;
    part.material.opacity = 1;
    part.material.depthTest = false;
  });
  return group;
}

function applyAgentScale(agent, scale = activeSceneScale) {
  agent.userData.sceneScale = scale;
  agent.scale.setScalar(scale);
  agent.userData.height = agent.userData.baseHeight * scale;
  agent.userData.cameraOffset.copy(agent.userData.baseCameraOffset).multiplyScalar(scale);
}

function createQuadruped() {
  const group = new THREE.Group();
  group.userData.displayName = "Robot Dog";
  group.userData.height = 0.48;
  group.userData.cameraOffset = new THREE.Vector3(0, 0.42, 0.25);

  const body = createBox("body", new THREE.Vector3(0.62, 0.22, 0.28), 0x8bb7ff);
  body.position.y = 0.34;
  group.add(body);

  const head = createBox("head", new THREE.Vector3(0.26, 0.18, 0.2), 0xffcf70);
  head.position.set(0, 0.39, 0.31);
  group.add(head);

  for (const x of [-0.23, 0.23]) {
    for (const z of [-0.12, 0.16]) {
      const leg = createCapsule("leg", 0.028, 0.24, 0x58e0c2);
      leg.position.set(x, 0.16, z);
      group.add(leg);
    }
  }

  return group;
}

function createRover() {
  const group = new THREE.Group();
  group.userData.displayName = "Survey Rover";
  group.userData.height = 0.36;
  group.userData.cameraOffset = new THREE.Vector3(0, 0.32, 0.24);

  const base = createBox("base", new THREE.Vector3(0.56, 0.18, 0.42), 0xe8eee7);
  base.position.y = 0.24;
  group.add(base);

  const mast = createCapsule("mast", 0.025, 0.34, 0xffcf70);
  mast.position.y = 0.53;
  group.add(mast);

  const camera = createBox("sensor", new THREE.Vector3(0.18, 0.08, 0.1), 0x58e0c2);
  camera.position.set(0, 0.72, 0.07);
  group.add(camera);

  for (const x of [-0.26, 0.26]) {
    for (const z of [-0.18, 0.18]) {
      const wheel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.075, 0.075, 0.055, 12),
        new THREE.MeshStandardMaterial({ color: 0x10181a, roughness: 0.46, metalness: 0.2 }),
      );
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(x, 0.12, z);
      group.add(wheel);
    }
  }

  return group;
}

const agentFactories = {
  humanoid: createHumanoid,
  quadruped: createQuadruped,
  rover: createRover,
};

const agentShortNames = {
  humanoid: "Robot",
  quadruped: "Dog",
  rover: "Rover",
};

function createAgentButton(agent) {
  const button = document.createElement("button");
  button.className = "agent-instance-button";
  button.type = "button";
  button.dataset.agentId = String(agent.userData.agentId);
  button.textContent = agent.userData.instanceLabel;
  button.addEventListener("click", () => {
    canvas.focus();
    setActiveAgent(agent);
  });
  return button;
}

function refreshAgentRoster() {
  if (!agentRosterEl) return;
  agentRosterEl.replaceChildren(...agents.map(createAgentButton));
  agentRosterEl.querySelectorAll(".agent-instance-button").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.agentId === String(activeAgent?.userData.agentId));
  });
}

function disposeMeshTree(root) {
  root.traverse((object) => {
    if (!object.isMesh) return;
    object.geometry?.dispose?.();
    if (Array.isArray(object.material)) {
      object.material.forEach((material) => material.dispose?.());
    } else {
      object.material?.dispose?.();
    }
  });
}

function disposeSceneMeshMaterials(root) {
  root.traverse((object) => {
    if (!object.isMesh) return;
    if (Array.isArray(object.material)) {
      object.material.forEach((material) => material.dispose?.());
    } else {
      object.material?.dispose?.();
    }
  });
}

function removeAgent(agent) {
  scene.remove(agent);
  disposeMeshTree(agent);
}

function spawnAgent(type) {
  activeAgentType = type;
  const agent = prepareAgent(agentFactories[type](), type);
  agentIdCounter += 1;
  agent.userData.agentId = agentIdCounter;
  agent.userData.agentNumber = agents.filter((candidate) => candidate.userData.agentType === type).length + 1;
  agent.userData.instanceLabel = `${agentShortNames[type] ?? "Agent"} ${agent.userData.agentNumber}`;
  applyAgentScale(agent);
  const spawn = spawnPoints[spawnIndex % spawnPoints.length];
  spawnIndex += 1;

  placeAgentOnSpawn(agent, spawn);
  scene.add(agent);
  agents.push(agent);
  setActiveAgent(agent);

  if (agents.length > 6) {
    const staleIndex = agents.findIndex((candidate, index) => index > 0 && candidate !== activeAgent);
    const fallbackIndex = agents.findIndex((candidate) => candidate !== activeAgent);
    const removalIndex = staleIndex === -1 ? fallbackIndex : staleIndex;
    if (removalIndex !== -1) {
      const [stale] = agents.splice(removalIndex, 1);
      removeAgent(stale);
      if (stale === activeAgent) activeAgent = null;
    }
  }

  refreshAgentRoster();
}

function placeAgentOnSpawn(agent, spawn) {
  applyAgentScale(agent);
  agent.position.copy(spawn);
  agent.position.y = sampleGroundHeight(agent.position.x, agent.position.z);
  const heading = Math.atan2(sceneCenter.x - agent.position.x, sceneCenter.z - agent.position.z);
  agent.rotation.y = heading;
  targetYaw = heading;
}

function setActiveAgent(agent) {
  activeAgent = agent;
  activeAgentType = agent.userData.agentType;
  targetYaw = activeAgent.rotation.y;
  currentVelocity = 0;
  activeMarker.visible = true;
  const markerScale = activeAgent.userData.sceneScale ?? 1;
  activeMarker.scale.setScalar(markerScale);
  activeMarker.position.set(activeAgent.position.x, activeAgent.position.y + 0.025 * markerScale, activeAgent.position.z);

  const activeLabel = `${activeAgent.userData.instanceLabel} · ${activeAgent.userData.displayName}`;
  agentNameEl.textContent = activeLabel;
  canvas.dataset.activeAgent = activeLabel;
  agentButtons.forEach((button) => {
    button.classList.remove("is-active");
  });
  refreshAgentRoster();
}

function resetAgentsForScene() {
  pointerKeys.clear();
  currentVelocity = 0;
  speedEl.textContent = "0.0 m/s";

  if (!agents.length) {
    activeAgentType = "humanoid";
    spawnIndex = 0;
    spawnAgent(activeAgentType);
    return;
  }

  const primaryAgent = agents[0];
  for (let index = agents.length - 1; index >= 1; index -= 1) {
    const [stale] = agents.splice(index, 1);
    removeAgent(stale);
  }

  placeAgentOnSpawn(primaryAgent, spawnPoints[0] ?? new THREE.Vector3(0, sceneFloorHeight, 0));
  spawnIndex = 1;
  setActiveAgent(primaryAgent);
  refreshAgentRoster();
}

function frameRuntimeScene(sceneData) {
  const radius = THREE.MathUtils.clamp(sceneData?.radius ?? 2.4, 2.1, 4.8);
  const frameScale = sceneData?.runtimeScene?.frameScale ?? 1;
  cameraFrameCenter.copy(sceneCenter);
  cameraFrameCenter.y = Math.max(sceneFloorHeight + 0.72 * activeSceneScale, sceneCenter.y + 0.28 * activeSceneScale);
  controls.target.copy(cameraFrameCenter);
  worldCamera.position
    .copy(cameraFrameCenter)
    .add(new THREE.Vector3(
      0.28,
      Math.max(1.75, radius * 0.42) * frameScale,
      Math.max(4.15, radius * 1.42) * frameScale,
    ));
  worldCamera.lookAt(cameraFrameCenter);
  worldCamera.updateProjectionMatrix();
  controls.update();
}

function pickAgent(event) {
  const bounds = canvas.getBoundingClientRect();
  pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
  pointer.y = -(((event.clientY - bounds.top) / bounds.height) * 2 - 1);
  raycaster.setFromCamera(pointer, worldCamera);
  const hits = raycaster.intersectObjects(agents, true);
  const hit = hits.find((entry) => entry.object.userData.agentRoot);
  if (hit) {
    setActiveAgent(hit.object.userData.agentRoot);
    canvas.focus();
  }
}

function sampleGroundHeight(x = 0, z = 0) {
  if (!sceneMesh) return sceneFloorHeight;
  const cacheKey = `${Math.round(x * 32)},${Math.round(z * 32)}`;
  const cachedHeight = groundHeightCache.get(cacheKey);
  if (cachedHeight !== undefined) return cachedHeight;

  groundProbeOrigin.set(x, 8, z);
  groundRaycaster.set(groundProbeOrigin, groundProbeDirection);
  groundRaycaster.far = 12;
  const hits = groundRaycaster.intersectObject(sceneMesh, true);
  const horizontalHits = hits.filter((hit) => hit.face?.normal && Math.abs(hit.face.normal.y) > 0.18);
  const floorHit = horizontalHits.reduce((best, hit) => {
    if (!best) return hit;
    return Math.abs(hit.point.y - sceneFloorHeight) < Math.abs(best.point.y - sceneFloorHeight) ? hit : best;
  }, null);
  const height = (floorHit ?? hits[0])?.point.y ?? sceneFloorHeight;
  groundHeightCache.set(cacheKey, height);
  if (groundHeightCache.size > 640) groundHeightCache.delete(groundHeightCache.keys().next().value);
  return height;
}

function buildSceneSpawnPoints(geometries) {
  const geometryList = Array.isArray(geometries) ? geometries : [geometries];
  const box = boundingBoxForGeometries(geometryList);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const centroid = new THREE.Vector3();
  const sceneHeight = Math.max(box.max.y - box.min.y, 1);
  const floorBandLimit = box.min.y + sceneHeight * 0.36;
  const horizontalCandidates = [];

  for (const geometry of geometryList) {
    const position = geometry.attributes.position;
    const index = geometry.index;
    const faceCount = index ? index.count / 3 : Math.floor(position.count / 3);
    const step = Math.max(1, Math.floor(faceCount / 12000));

    for (let face = 0; face < faceCount; face += step) {
      const ia = index ? index.getX(face * 3) : face * 3;
      const ib = index ? index.getX(face * 3 + 1) : face * 3 + 1;
      const ic = index ? index.getX(face * 3 + 2) : face * 3 + 2;
      a.fromBufferAttribute(position, ia);
      b.fromBufferAttribute(position, ib);
      c.fromBufferAttribute(position, ic);
      normal.copy(ab.subVectors(b, a)).cross(ac.subVectors(c, a)).normalize();
      if (Math.abs(normal.y) < 0.42) continue;
      centroid.copy(a).add(b).add(c).multiplyScalar(1 / 3);
      if (Math.abs(centroid.x) > 1.9 || Math.abs(centroid.z) > 1.9) continue;
      horizontalCandidates.push(centroid.clone());
    }
  }

  if (!horizontalCandidates.length) {
    return { points: defaultSpawnPoints.map((point) => point.clone()), floorHeight: sceneFloorHeight };
  }

  const sortedHeights = horizontalCandidates
    .map((candidate) => candidate.y)
    .filter((height) => height <= floorBandLimit)
    .sort((a, b) => a - b);
  const floorHeights = sortedHeights.length >= 8
    ? sortedHeights
    : horizontalCandidates.map((candidate) => candidate.y).sort((a, b) => a - b);
  const floorHeight = floorHeights[Math.floor((floorHeights.length - 1) * 0.18)] ?? sceneFloorHeight;
  const floorTolerance = Math.max(0.16, sceneHeight * 0.055);
  let candidates = horizontalCandidates.filter((candidate) => Math.abs(candidate.y - floorHeight) <= floorTolerance);
  if (candidates.length < 4) {
    candidates = horizontalCandidates.filter((candidate) => Math.abs(candidate.y - floorHeight) <= floorTolerance * 2.2);
  }

  candidates.sort((a, b) => (
    Math.abs(a.y - floorHeight) - Math.abs(b.y - floorHeight)
    || (a.x * a.x + a.z * a.z) - (b.x * b.x + b.z * b.z)
  ));
  const chosen = [];
  for (const candidate of candidates) {
    if (chosen.every((point) => new THREE.Vector2(point.x, point.z).distanceTo(new THREE.Vector2(candidate.x, candidate.z)) > 0.55)) {
      chosen.push(candidate.clone());
    }
    if (chosen.length >= 6) break;
  }
  return {
    points: chosen.length ? chosen : candidates.slice(0, 3),
    floorHeight,
  };
}

function dropBeacon() {
  if (!activeAgent) return;
  const beacon = new THREE.Group();
  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(0.055, 12, 8),
    new THREE.MeshBasicMaterial({ color: 0xffcf70 }),
  );
  const stem = createCapsule("beacon-stem", 0.012, 0.18, 0xffcf70);
  stem.position.y = 0.1;
  glow.position.y = 0.23;
  beacon.add(stem, glow);
  beacon.position.copy(activeAgent.position);
  beacon.position.y = sampleGroundHeight(beacon.position.x, beacon.position.z);
  beacons.push(beacon);
  scene.add(beacon);

  if (beacons.length > 8) {
    const oldest = beacons.shift();
    scene.remove(oldest);
  }
}

function clearBeacons() {
  while (beacons.length) {
    const beacon = beacons.pop();
    scene.remove(beacon);
  }
}

function driveVector() {
  const forward =
    Number(pointerKeys.has("KeyW") || pointerKeys.has("ArrowUp") || pointerKeys.has("forward")) -
    Number(pointerKeys.has("KeyS") || pointerKeys.has("ArrowDown") || pointerKeys.has("backward"));
  const strafe =
    Number(pointerKeys.has("KeyD") || pointerKeys.has("ArrowRight") || pointerKeys.has("right")) -
    Number(pointerKeys.has("KeyA") || pointerKeys.has("ArrowLeft") || pointerKeys.has("left"));
  const turn =
    Number(pointerKeys.has("KeyQ") || pointerKeys.has("rotate-left")) -
    Number(pointerKeys.has("KeyE") || pointerKeys.has("rotate-right"));
  return { forward, strafe, turn };
}

function updateAgent(delta) {
  if (!activeAgent) return;

  const { forward, strafe, turn } = driveVector();
  const inputLength = Math.hypot(forward, strafe);
  const viewForward = new THREE.Vector3();
  worldCamera.getWorldDirection(viewForward);
  viewForward.y = 0;
  if (viewForward.lengthSq() < 0.0001) viewForward.set(0, 0, 1);
  viewForward.normalize();
  const viewRight = new THREE.Vector3().crossVectors(viewForward, worldCamera.up).normalize();
  const moveDirection = new THREE.Vector3()
    .addScaledVector(viewForward, forward)
    .addScaledVector(viewRight, strafe);
  if (moveDirection.lengthSq() > 0.0001) {
    moveDirection.normalize();
    targetYaw = Math.atan2(moveDirection.x, moveDirection.z);
  } else if (turn) {
    targetYaw += turn * delta * 2.25;
  }
  activeAgent.rotation.y = THREE.MathUtils.damp(activeAgent.rotation.y, targetYaw, 14, delta);

  const speedScale = activeAgent.userData.sceneScale ?? 1;
  currentVelocity = THREE.MathUtils.damp(currentVelocity, Math.min(inputLength, 1) * 1.15 * speedScale, 9, delta);
  if (moveDirection.lengthSq() > 0.0001) {
    activeAgent.position.addScaledVector(moveDirection, currentVelocity * delta);
  }
  activeAgent.position.x = THREE.MathUtils.clamp(activeAgent.position.x, -2.05, 2.05);
  activeAgent.position.z = THREE.MathUtils.clamp(activeAgent.position.z, -2.05, 2.05);
  activeAgent.position.y = sampleGroundHeight(activeAgent.position.x, activeAgent.position.z);

  const markerScale = activeAgent.userData.sceneScale ?? 1;
  activeMarker.position.lerp(
    new THREE.Vector3(activeAgent.position.x, activeAgent.position.y + 0.025 * markerScale, activeAgent.position.z),
    1 - Math.exp(-delta * 16),
  );
  activeMarker.rotation.z += delta * 0.72;

  const gait = clock.elapsedTime * Math.max(2.2, Math.abs(currentVelocity) * 9);
  activeAgent.children.forEach((part, index) => {
    if (part.name === "leg") {
      part.rotation.x = Math.sin(gait + index * 1.4) * Math.abs(currentVelocity) * 0.42;
    }
    if (part.name === "arm") {
      part.rotation.x = Math.cos(gait + index * 1.2) * Math.abs(currentVelocity) * 0.38;
    }
  });

  speedEl.textContent = `${Math.abs(currentVelocity).toFixed(1)} m/s`;
}

function updateCameras(delta) {
  if (!activeAgent) return;

  controls.target.lerp(cameraFrameCenter, 1 - Math.exp(-delta * 2.8));

  const fpvOffset = activeAgent.userData.cameraOffset.clone().applyEuler(activeAgent.rotation);
  fpvCamera.position.copy(activeAgent.position).add(fpvOffset);
  const forwardLook = new THREE.Vector3(0, activeAgent.userData.height * 0.42, 2.2 * (activeAgent.userData.sceneScale ?? 1)).applyEuler(activeAgent.rotation);
  const sceneLook = sceneCenter.clone().sub(activeAgent.position).multiplyScalar(0.35);
  fpvCamera.lookAt(activeAgent.position.clone().add(forwardLook).add(sceneLook));
}

function updateRendererSize() {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const pixelRatio = maxPixelRatio();
  renderer.setPixelRatio(pixelRatio);
  if (canvas.width !== Math.round(width * pixelRatio) || canvas.height !== Math.round(height * pixelRatio)) {
    renderer.setSize(width, height, false);
  }

  worldCamera.aspect = width / Math.max(height, 1);
  worldCamera.updateProjectionMatrix();

  if (fpvRenderer && fpvCanvas) {
    const fpvWidth = fpvCanvas.clientWidth;
    const fpvHeight = fpvCanvas.clientHeight;
    fpvRenderer.setPixelRatio(pixelRatio);
    if (
      fpvCanvas.width !== Math.round(fpvWidth * pixelRatio) ||
      fpvCanvas.height !== Math.round(fpvHeight * pixelRatio)
    ) {
      fpvRenderer.setSize(fpvWidth, fpvHeight, false);
    }
    fpvCamera.aspect = fpvWidth / Math.max(fpvHeight, 1);
    fpvCamera.updateProjectionMatrix();
  }
}

async function loadScene() {
  if (meshLoadingPromise) return meshLoadingPromise;
  meshLoadingPromise = loadSceneMesh(activeSceneId, true);
  return meshLoadingPromise;
}

async function loadRuntimeSceneData(runtimeScene) {
  if (sceneDataCache.has(runtimeScene.id)) return sceneDataCache.get(runtimeScene.id);
  const loadPromise = loadPlyGeometryParts(runtimeScene).then((geometries) => {
    const box = normalizeGeometries(geometries);
    const center = new THREE.Vector3();
    box.getCenter(center);
    return {
      geometries,
      center,
      radius: boundingSphereRadiusForBox(box),
      spawnData: buildSceneSpawnPoints(geometries),
      runtimeScene,
    };
  });
  sceneDataCache.set(runtimeScene.id, loadPromise);
  return loadPromise;
}

function applySceneData(sceneData) {
  if (sceneMesh) {
    scene.remove(sceneMesh);
    disposeSceneMeshMaterials(sceneMesh);
  }
  sceneMesh = new THREE.Group();
  for (const geometry of sceneData.geometries) {
    const mesh = new THREE.Mesh(geometry, createSceneMaterial());
    mesh.renderOrder = 1;
    sceneMesh.add(mesh);
  }
  sceneMesh.position.copy(sceneMeshOffset);
  scene.add(sceneMesh);

  sceneCenter.copy(sceneData.center).add(sceneMeshOffset);
  sceneFloorHeight = sceneData.spawnData.floorHeight + sceneMeshOffset.y;
  spawnPoints = sceneData.spawnData.points.map((point) => point.clone().add(sceneMeshOffset));
  groundHeightCache.clear();
  resetAgentsForScene();
  clearBeacons();
  frameRuntimeScene(sceneData);
}

async function loadSceneMesh(sceneId = activeSceneId, settleReady = false) {
  const runtimeScene = runtimeScenes.find((candidate) => candidate.id === sceneId) ?? runtimeScenes[0];
  const token = ++sceneLoadToken;
  activeSceneId = runtimeScene.id;
  activeSceneScale = runtimeScene.agentScale ?? 1;
  if (runtimeSceneSelect) runtimeSceneSelect.value = activeSceneId;
  showStatus(`Loading ${runtimeScene.label}...`);
  try {
    const sceneData = await loadRuntimeSceneData(runtimeScene);
    if (token !== sceneLoadToken) return;
    applySceneData(sceneData);
    canvas.dataset.runtimeScene = runtimeScene.id;
    hideStatus();
    if (settleReady && !didSettleReady) {
      didSettleReady = true;
      readyResolve?.();
    }
  } catch (error) {
    console.error(error);
    showStatus(`Could not load ${runtimeScene.label}`, true);
    if (settleReady && !didSettleReady) {
      didSettleReady = true;
      readyReject?.(error);
    }
  }
}

function requestFrame() {
  if (!isRunning || frameId || document.hidden) return;
  frameId = requestAnimationFrame(animate);
}

function animate(now = 0) {
  frameId = 0;
  if (!isRunning || document.hidden) return;
  if (now - lastRenderTime < 32) {
    requestFrame();
    return;
  }
  lastRenderTime = now;

  const delta = Math.min(clock.getDelta(), 0.05);
  updateRendererSize();
  updateAgent(delta);
  updateCameras(delta);

  controls.update();
  renderer.render(scene, worldCamera);

  if (fpvRenderer) {
    const agentWasVisible = activeAgent?.visible ?? true;
    const markerWasVisible = activeMarker.visible;
    if (activeAgent) activeAgent.visible = false;
    activeMarker.visible = false;
    fpvRenderer.render(scene, fpvCamera);
    if (activeAgent) activeAgent.visible = agentWasVisible;
    activeMarker.visible = markerWasVisible;
  }

  for (const beacon of beacons) {
    beacon.rotation.y += delta * 1.6;
  }

  requestFrame();
}

function startPlayground() {
  if (didStart) return;
  didStart = true;
  spawnAgent(activeAgentType);
  loadScene();
}

function resume() {
  startPlayground();
  if (isRunning) return;
  isRunning = true;
  clock.getDelta();
  requestFrame();
}

function pause() {
  isRunning = false;
  pointerKeys.clear();
  currentVelocity = 0;
  if (frameId) {
    cancelAnimationFrame(frameId);
    frameId = 0;
  }
}

agentButtons.forEach((button) => {
  button.addEventListener("click", () => {
    canvas.focus();
    spawnAgent(button.dataset.agent);
  });
});

dropBeaconButton?.addEventListener("click", () => {
  canvas.focus();
  dropBeacon();
});

runtimeSceneSelect?.addEventListener("change", () => {
  canvas.focus();
  pointerKeys.clear();
  currentVelocity = 0;
  meshLoadingPromise = loadSceneMesh(runtimeSceneSelect.value);
});

driveButtons.forEach((button) => {
  const key = button.dataset.drive;
  const activate = (event) => {
    event.preventDefault();
    canvas.focus();
    pointerKeys.add(key);
  };
  const deactivate = (event) => {
    event.preventDefault();
    pointerKeys.delete(key);
  };
  button.addEventListener("pointerdown", activate);
  button.addEventListener("pointerup", deactivate);
  button.addEventListener("pointercancel", deactivate);
  button.addEventListener("pointerleave", deactivate);
});

window.addEventListener("keydown", (event) => {
  if (document.activeElement !== canvas) return;
  if (!["KeyW", "KeyA", "KeyS", "KeyD", "KeyQ", "KeyE", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(event.code)) {
    return;
  }

  if (event.code === "Space") {
    dropBeacon();
  } else {
    pointerKeys.add(event.code);
  }

  event.preventDefault();
});

window.addEventListener("keyup", (event) => {
  pointerKeys.delete(event.code);
});

canvas.addEventListener("pointerdown", (event) => {
  canvas.focus();
  pointerDown.set(event.clientX, event.clientY);
  pointerDownTime = performance.now();
});

canvas.addEventListener("pointerup", (event) => {
  const travel = pointerDown.distanceTo(new THREE.Vector2(event.clientX, event.clientY));
  if (travel < 6 && performance.now() - pointerDownTime < 260) {
    pickAgent(event);
  }
});

if (!prefersReducedMotion) {
  controls.autoRotate = false;
}

populateRuntimeScenes();
resume();

return { pause, resume, ready: readyPromise };
}
