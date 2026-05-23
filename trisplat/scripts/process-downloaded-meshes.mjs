import { mkdir, open, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const defaultCandidateRoots = [
  "/Users/bytedance/Downloads/scale0.75",
  "/Users/bytedance/Downloads/scale0.5",
];
const candidateRoots = process.argv.slice(2).length ? process.argv.slice(2) : defaultCandidateRoots;
const outputRoot = "assets/mesh/gallery-web/dl3dv/additional";
const maxFaces = 240000;
const githubFileLimitBytes = 95 * 1024 * 1024;
const firstAdditionalSceneNumber = 7;
const cropLowerQuantile = 0.005;
const cropUpperQuantile = 0.995;
const targetMaxExtent = 4.0;
const headerTerminator = Buffer.from("end_header\n");

const sceneFiles = [
  "055a5bda9c5058afb0f826ffe6f42a31b5f7958c980492858a18cbeb8a8d3b7f.ply",
  "0a2e21aeea2e8c0862804f9b4f67c0f1597386121b7f9b44fb5c8be779767826.ply",
  "1f1f6e18e61e425fb2baff21f0c654e114b8d25a7eea7a91934e07fe95d05389.ply",
  "26fb8e55f181dd9fb6435f0bacb7fa95202c979f1620e90923088a456d5ca63f.ply",
  "62fef386fca8708db4893953d67c22a412034da44f4747a95cf607108d70df35.ply",
  "ec6a692d0c2ec4deb8b0dddf6ace512d86c9991d0d75be610d287c4140020cb7.ply",
];

const scalarTypes = {
  char: { size: 1, read: (buffer, offset) => buffer.readInt8(offset) },
  int8: { size: 1, read: (buffer, offset) => buffer.readInt8(offset) },
  uchar: { size: 1, read: (buffer, offset) => buffer.readUInt8(offset) },
  uint8: { size: 1, read: (buffer, offset) => buffer.readUInt8(offset) },
  short: { size: 2, read: (buffer, offset) => buffer.readInt16LE(offset) },
  int16: { size: 2, read: (buffer, offset) => buffer.readInt16LE(offset) },
  ushort: { size: 2, read: (buffer, offset) => buffer.readUInt16LE(offset) },
  uint16: { size: 2, read: (buffer, offset) => buffer.readUInt16LE(offset) },
  int: { size: 4, read: (buffer, offset) => buffer.readInt32LE(offset) },
  int32: { size: 4, read: (buffer, offset) => buffer.readInt32LE(offset) },
  uint: { size: 4, read: (buffer, offset) => buffer.readUInt32LE(offset) },
  uint32: { size: 4, read: (buffer, offset) => buffer.readUInt32LE(offset) },
  float: { size: 4, read: (buffer, offset) => buffer.readFloatLE(offset) },
  float32: { size: 4, read: (buffer, offset) => buffer.readFloatLE(offset) },
  double: { size: 8, read: (buffer, offset) => buffer.readDoubleLE(offset) },
  float64: { size: 8, read: (buffer, offset) => buffer.readDoubleLE(offset) },
};

async function readHeaderText(filePath) {
  const file = await open(filePath, "r");
  try {
    const buffer = Buffer.alloc(8192);
    const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
    const headerEnd = buffer.indexOf(headerTerminator);
    if (headerEnd < 0 || headerEnd >= bytesRead) throw new Error(`PLY header is longer than ${buffer.length} bytes in ${filePath}`);
    return buffer.subarray(0, headerEnd + headerTerminator.length).toString("ascii");
  } finally {
    await file.close();
  }
}

function parseHeaderCounts(headerText, filePath) {
  const vertexCount = Number(headerText.match(/element vertex (\d+)/)?.[1]);
  const faceCount = Number(headerText.match(/element face (\d+)/)?.[1]);
  if (!Number.isFinite(vertexCount) || !Number.isFinite(faceCount)) {
    throw new Error(`Could not read vertex/face counts from ${filePath}`);
  }
  return { vertexCount, faceCount };
}

async function chooseSource(file) {
  const candidates = [];

  for (const root of candidateRoots) {
    const filePath = path.join(root, file);
    const counts = parseHeaderCounts(await readHeaderText(filePath), filePath);
    candidates.push({ root, filePath, ...counts });
  }

  candidates.sort((a, b) => {
    if (b.faceCount !== a.faceCount) return b.faceCount - a.faceCount;
    if (b.vertexCount !== a.vertexCount) return b.vertexCount - a.vertexCount;
    return candidateRoots.indexOf(a.root) - candidateRoots.indexOf(b.root);
  });

  return candidates[0];
}

function parseHeader(buffer, filePath) {
  const headerEnd = buffer.indexOf(headerTerminator);
  if (headerEnd < 0) throw new Error(`Missing PLY header terminator in ${filePath}`);

  const text = buffer.subarray(0, headerEnd + headerTerminator.length).toString("ascii");
  const lines = text.trimEnd().split(/\r?\n/);
  const elements = [];
  let current = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line === "ply" || line.startsWith("comment ") || line === "end_header") continue;
    const parts = line.split(/\s+/);

    if (parts[0] === "format") {
      if (parts[1] !== "binary_little_endian") {
        throw new Error(`Unsupported PLY format ${parts[1]} in ${filePath}`);
      }
      continue;
    }

    if (parts[0] === "element") {
      current = { name: parts[1], count: Number(parts[2]), properties: [] };
      elements.push(current);
      continue;
    }

    if (parts[0] === "property" && current) {
      if (parts[1] === "list") {
        current.properties.push({
          kind: "list",
          countType: parts[2],
          itemType: parts[3],
          name: parts[4],
        });
      } else {
        current.properties.push({ kind: "scalar", type: parts[1], name: parts[2] });
      }
    }
  }

  return {
    bodyOffset: headerEnd + headerTerminator.length,
    elements,
    vertex: elements.find((element) => element.name === "vertex"),
    face: elements.find((element) => element.name === "face"),
  };
}

function scalarReader(type) {
  const reader = scalarTypes[type];
  if (!reader) throw new Error(`Unsupported scalar type: ${type}`);
  return reader;
}

function elementLayout(element) {
  let stride = 0;
  const offsets = new Map();

  for (const property of element.properties) {
    if (property.kind !== "scalar") return null;
    offsets.set(property.name, stride);
    stride += scalarReader(property.type).size;
  }

  return { stride, offsets };
}

function readScalar(buffer, baseOffset, element, layout, propertyName) {
  const offset = layout.offsets.get(propertyName);
  if (offset === undefined) return undefined;
  const property = element.properties.find((candidate) => candidate.name === propertyName);
  return scalarReader(property.type).read(buffer, baseOffset + offset);
}

function readColor(buffer, baseOffset, element, layout, propertyName, fallback) {
  const value = readScalar(buffer, baseOffset, element, layout, propertyName);
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(255, Math.round(value)));
}

function readFace(buffer, offset, faceElement) {
  let cursor = offset;
  let indices = null;

  for (const property of faceElement.properties) {
    if (property.kind === "scalar") {
      cursor += scalarReader(property.type).size;
      continue;
    }

    const countReader = scalarReader(property.countType);
    const itemReader = scalarReader(property.itemType);
    const count = countReader.read(buffer, cursor);
    cursor += countReader.size;
    const values = [];

    for (let index = 0; index < count; index += 1) {
      values.push(itemReader.read(buffer, cursor));
      cursor += itemReader.size;
    }

    if (property.name === "vertex_indices" || property.name === "vertex_index") indices = values;
  }

  return { nextOffset: cursor, indices };
}

function quantile(values, q, label) {
  if (!values.length) throw new Error(`No finite ${label} coordinate samples found`);
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * q)));
  return sorted[index];
}

function sampleBounds(input, header, vertexLayout) {
  const stride = vertexLayout.stride;
  const vertexStart = header.bodyOffset;
  const sampleStep = Math.max(1, Math.floor(header.vertex.count / 160000));
  const samples = [[], [], []];

  for (let index = 0; index < header.vertex.count; index += sampleStep) {
    const offset = vertexStart + index * stride;
    const x = readScalar(input, offset, header.vertex, vertexLayout, "x");
    const y = readScalar(input, offset, header.vertex, vertexLayout, "y");
    const z = readScalar(input, offset, header.vertex, vertexLayout, "z");

    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
    samples[0].push(x);
    samples[1].push(y);
    samples[2].push(z);
  }

  const axes = ["x", "y", "z"];
  const min = samples.map((axis, index) => quantile(axis, cropLowerQuantile, axes[index]));
  const max = samples.map((axis, index) => quantile(axis, cropUpperQuantile, axes[index]));
  const center = min.map((value, index) => (value + max[index]) * 0.5);
  const size = max.map((value, index) => Math.max(value - min[index], Number.EPSILON));
  const scale = targetMaxExtent / Math.max(...size, Number.EPSILON);

  return { min, max, center, scale, sampleCount: samples[0].length };
}

function isInsideCrop(x, y, z, bounds) {
  return (
    x >= bounds.min[0] &&
    x <= bounds.max[0] &&
    y >= bounds.min[1] &&
    y <= bounds.max[1] &&
    z >= bounds.min[2] &&
    z <= bounds.max[2]
  );
}

function transformedVertex(input, header, vertexLayout, vertexStart, index, bounds) {
  const offset = vertexStart + index * vertexLayout.stride;
  const x = readScalar(input, offset, header.vertex, vertexLayout, "x");
  const y = readScalar(input, offset, header.vertex, vertexLayout, "y");
  const z = readScalar(input, offset, header.vertex, vertexLayout, "z");

  return {
    x: (x - bounds.center[0]) * bounds.scale,
    y: (y - bounds.center[1]) * bounds.scale,
    z: (z - bounds.center[2]) * bounds.scale,
    red: readColor(input, offset, header.vertex, vertexLayout, "red", 210),
    green: readColor(input, offset, header.vertex, vertexLayout, "green", 214),
    blue: readColor(input, offset, header.vertex, vertexLayout, "blue", 210),
  };
}

function triangleAreaSquared(a, b, c) {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const abz = b.z - a.z;
  const acx = c.x - a.x;
  const acy = c.y - a.y;
  const acz = c.z - a.z;
  const cx = aby * acz - abz * acy;
  const cy = abz * acx - abx * acz;
  const cz = abx * acy - aby * acx;
  return cx * cx + cy * cy + cz * cz;
}

async function convertMesh(inputPath, outputPath) {
  const input = await readFile(inputPath);
  const header = parseHeader(input, inputPath);
  if (!header.vertex || !header.face) throw new Error(`Missing vertex or face element in ${inputPath}`);

  const vertexLayout = elementLayout(header.vertex);
  if (!vertexLayout) throw new Error(`Unsupported vertex list property in ${inputPath}`);

  const vertexStart = header.bodyOffset;
  const faceStart = vertexStart + header.vertex.count * vertexLayout.stride;
  const bounds = sampleBounds(input, header, vertexLayout);
  const valid = new Uint8Array(header.vertex.count);
  let validVertexCount = 0;

  for (let index = 0; index < header.vertex.count; index += 1) {
    const offset = vertexStart + index * vertexLayout.stride;
    const x = readScalar(input, offset, header.vertex, vertexLayout, "x");
    const y = readScalar(input, offset, header.vertex, vertexLayout, "y");
    const z = readScalar(input, offset, header.vertex, vertexLayout, "z");
    const ok = Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z) && isInsideCrop(x, y, z, bounds);
    valid[index] = ok ? 1 : 0;
    if (ok) validVertexCount += 1;
  }

  const used = new Uint8Array(header.vertex.count);
  const sampledFaces = [];
  const sampleStep = header.face.count <= maxFaces ? 1 : header.face.count / maxFaces;
  let cursor = faceStart;
  let sampleAccumulator = 0;
  let skippedFaces = 0;

  for (let faceIndex = 0; faceIndex < header.face.count; faceIndex += 1) {
    const face = readFace(input, cursor, header.face);
    cursor = face.nextOffset;

    sampleAccumulator += 1;
    if (sampleStep > 1 && sampleAccumulator < sampleStep) continue;
    sampleAccumulator -= sampleStep;

    if (!face.indices || face.indices.length !== 3) {
      skippedFaces += 1;
      continue;
    }

    const [a, b, c] = face.indices;
    const validFace =
      a >= 0 &&
      b >= 0 &&
      c >= 0 &&
      a < header.vertex.count &&
      b < header.vertex.count &&
      c < header.vertex.count &&
      a !== b &&
      b !== c &&
      a !== c &&
      valid[a] &&
      valid[b] &&
      valid[c];

    if (!validFace) {
      skippedFaces += 1;
      continue;
    }

    const va = transformedVertex(input, header, vertexLayout, vertexStart, a, bounds);
    const vb = transformedVertex(input, header, vertexLayout, vertexStart, b, bounds);
    const vc = transformedVertex(input, header, vertexLayout, vertexStart, c, bounds);
    if (triangleAreaSquared(va, vb, vc) < 1e-12) {
      skippedFaces += 1;
      continue;
    }

    sampledFaces.push(a, b, c);
    used[a] = 1;
    used[b] = 1;
    used[c] = 1;
  }

  const remap = new Int32Array(header.vertex.count);
  remap.fill(-1);
  let outputVertexCount = 0;
  for (let index = 0; index < header.vertex.count; index += 1) {
    if (!used[index]) continue;
    remap[index] = outputVertexCount;
    outputVertexCount += 1;
  }

  const outputFaceCount = sampledFaces.length / 3;
  const outputHeader = Buffer.from(
    [
      "ply",
      "format binary_little_endian 1.0",
      "comment TriSplat web preview mesh",
      "comment q005-q995 crop, centered and scaled; web runtime applies Y-up axis alignment",
      "comment generated by scripts/process-downloaded-meshes.mjs",
      `element vertex ${outputVertexCount}`,
      "property float x",
      "property float y",
      "property float z",
      "property uchar red",
      "property uchar green",
      "property uchar blue",
      `element face ${outputFaceCount}`,
      "property list uchar uint vertex_indices",
      "end_header",
      "",
    ].join("\n"),
  );
  const vertexBytes = outputVertexCount * 15;
  const faceBytes = outputFaceCount * 13;
  const output = Buffer.alloc(outputHeader.length + vertexBytes + faceBytes);
  if (output.byteLength > githubFileLimitBytes) {
    const sizeMb = (output.byteLength / 1024 / 1024).toFixed(1);
    const limitMb = (githubFileLimitBytes / 1024 / 1024).toFixed(0);
    throw new Error(
      `${path.basename(outputPath)} would be ${sizeMb}MB, above the ${limitMb}MB GitHub upload guard. Lower maxFaces or split the scene.`,
    );
  }
  outputHeader.copy(output, 0);

  let writeOffset = outputHeader.length;
  for (let index = 0; index < header.vertex.count; index += 1) {
    if (remap[index] < 0) continue;
    const vertex = transformedVertex(input, header, vertexLayout, vertexStart, index, bounds);
    output.writeFloatLE(vertex.x, writeOffset);
    output.writeFloatLE(vertex.y, writeOffset + 4);
    output.writeFloatLE(vertex.z, writeOffset + 8);
    output.writeUInt8(vertex.red, writeOffset + 12);
    output.writeUInt8(vertex.green, writeOffset + 13);
    output.writeUInt8(vertex.blue, writeOffset + 14);
    writeOffset += 15;
  }

  for (let index = 0; index < sampledFaces.length; index += 3) {
    output.writeUInt8(3, writeOffset);
    output.writeUInt32LE(remap[sampledFaces[index]], writeOffset + 1);
    output.writeUInt32LE(remap[sampledFaces[index + 1]], writeOffset + 5);
    output.writeUInt32LE(remap[sampledFaces[index + 2]], writeOffset + 9);
    writeOffset += 13;
  }

  await writeFile(outputPath, output);
  return {
    input: path.basename(inputPath),
    sourceRoot: path.dirname(inputPath),
    output: path.relative(process.cwd(), outputPath),
    sourceVertices: header.vertex.count,
    sourceFaces: header.face.count,
    validVertices: validVertexCount,
    outputVertices: outputVertexCount,
    outputFaces: outputFaceCount,
    skippedFaces,
    sizeMb: Number((output.byteLength / 1024 / 1024).toFixed(2)),
    sampleCount: bounds.sampleCount,
    cropMin: bounds.min.map((value) => Number(value.toFixed(4))),
    cropMax: bounds.max.map((value) => Number(value.toFixed(4))),
    scale: Number(bounds.scale.toFixed(6)),
  };
}

async function main() {
  await mkdir(outputRoot, { recursive: true });

  const reports = [];
  for (const [index, file] of sceneFiles.entries()) {
    const source = await chooseSource(file);
    const sceneNumber = String(index + firstAdditionalSceneNumber).padStart(2, "0");
    const outputPath = path.join(outputRoot, `dl3dv-scene-${sceneNumber}.ply`);
    console.log(`Processing ${file} from ${source.root} -> ${outputPath}`);
    reports.push(await convertMesh(source.filePath, outputPath));
  }

  console.log(JSON.stringify(reports, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
