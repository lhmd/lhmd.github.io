import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";

const sourceRoot = "assets/mesh/gallery";
const outputRoot = "assets/mesh/gallery-web";
const githubFileLimitBytes = 95 * 1024 * 1024;
const outputTargetExtent = 4.0;
const coordinateLimit = 10000;
const gzipOptions = { level: 9 };
const perimeterCropQuantile = Number(process.env.TRISPLAT_WEB_CROP_QUANTILE ?? "0.015");
const maxWebFaces = Number(process.env.TRISPLAT_WEB_MAX_FACES ?? "1300000");
const randomSeed = Number(process.env.TRISPLAT_WEB_RANDOM_SEED ?? "20260524") >>> 0;
const maxQuantileSamples = 250000;
const headerTerminator = Buffer.from("end_header\n");

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

function quantile(values, ratio) {
  if (!values.length) return 0;
  values.sort((a, b) => a - b);
  const index = Math.max(0, Math.min(values.length - 1, Math.round((values.length - 1) * ratio)));
  return values[index];
}

function computeVertexTransform(input, header, vertexLayout) {
  const vertexStart = header.bodyOffset;
  const allMin = [Infinity, Infinity, Infinity];
  const allMax = [-Infinity, -Infinity, -Infinity];
  const croppedMin = [Infinity, Infinity, Infinity];
  const croppedMax = [-Infinity, -Infinity, -Infinity];
  const finite = new Uint8Array(header.vertex.count);
  const sampleStride = Math.max(1, Math.floor(header.vertex.count / maxQuantileSamples));
  const xSamples = [];
  const zSamples = [];
  let finiteCount = 0;

  for (let index = 0; index < header.vertex.count; index += 1) {
    const offset = vertexStart + index * vertexLayout.stride;
    const values = [
      readScalar(input, offset, header.vertex, vertexLayout, "x"),
      readScalar(input, offset, header.vertex, vertexLayout, "y"),
      readScalar(input, offset, header.vertex, vertexLayout, "z"),
    ];
    const ok =
      values.every(Number.isFinite) &&
      Math.abs(values[0]) < coordinateLimit &&
      Math.abs(values[1]) < coordinateLimit &&
      Math.abs(values[2]) < coordinateLimit;
    if (!ok) continue;

    finite[index] = 1;
    finiteCount += 1;
    for (let axis = 0; axis < 3; axis += 1) {
      allMin[axis] = Math.min(allMin[axis], values[axis]);
      allMax[axis] = Math.max(allMax[axis], values[axis]);
    }
    if (index % sampleStride === 0) {
      xSamples.push(values[0]);
      zSamples.push(values[2]);
    }
  }

  if (!finiteCount) throw new Error("No finite vertices found");
  const cropRatio = Math.max(0, Math.min(perimeterCropQuantile, 0.18));
  const cropBounds = cropRatio > 0 && xSamples.length >= 1000
    ? {
        minX: quantile(xSamples, cropRatio),
        maxX: quantile(xSamples, 1 - cropRatio),
        minZ: quantile(zSamples, cropRatio),
        maxZ: quantile(zSamples, 1 - cropRatio),
      }
    : {
        minX: allMin[0],
        maxX: allMax[0],
        minZ: allMin[2],
        maxZ: allMax[2],
      };

  let croppedVertexCount = 0;
  for (let index = 0; index < header.vertex.count; index += 1) {
    if (!finite[index]) continue;
    const offset = vertexStart + index * vertexLayout.stride;
    const values = [
      readScalar(input, offset, header.vertex, vertexLayout, "x"),
      readScalar(input, offset, header.vertex, vertexLayout, "y"),
      readScalar(input, offset, header.vertex, vertexLayout, "z"),
    ];
    if (values[0] < cropBounds.minX || values[0] > cropBounds.maxX || values[2] < cropBounds.minZ || values[2] > cropBounds.maxZ) continue;
    croppedVertexCount += 1;
    for (let axis = 0; axis < 3; axis += 1) {
      croppedMin[axis] = Math.min(croppedMin[axis], values[axis]);
      croppedMax[axis] = Math.max(croppedMax[axis], values[axis]);
    }
  }

  const min = croppedVertexCount ? croppedMin : allMin;
  const max = croppedVertexCount ? croppedMax : allMax;
  const center = min.map((value, index) => (value + max[index]) * 0.5);
  const size = max.map((value, index) => Math.max(value - min[index], Number.EPSILON));
  const scale = outputTargetExtent / Math.max(...size, Number.EPSILON);
  return { finite, finiteCount, croppedVertexCount, cropBounds, center, min, max, scale };
}

function readTransformedVertex(input, header, vertexLayout, vertexStart, index, transform) {
  const offset = vertexStart + index * vertexLayout.stride;
  const x = readScalar(input, offset, header.vertex, vertexLayout, "x");
  const y = readScalar(input, offset, header.vertex, vertexLayout, "y");
  const z = readScalar(input, offset, header.vertex, vertexLayout, "z");

  return {
    x: (x - transform.center[0]) * transform.scale,
    y: (y - transform.center[1]) * transform.scale,
    z: (z - transform.center[2]) * transform.scale,
    red: readColor(input, offset, header.vertex, vertexLayout, "red", 210),
    green: readColor(input, offset, header.vertex, vertexLayout, "green", 214),
    blue: readColor(input, offset, header.vertex, vertexLayout, "blue", 210),
  };
}

function createChunk(name) {
  return {
    name,
    faces: [],
    used: new Set(),
  };
}

function appendFaceToChunk(chunk, a, b, c) {
  chunk.faces.push(a, b, c);
  chunk.used.add(a);
  chunk.used.add(b);
  chunk.used.add(c);
}

function estimatedChunkBytes(chunk) {
  return 360 + chunk.used.size * 15 + (chunk.faces.length / 3) * 13;
}

function hashToUnit(seed, value) {
  let x = (value ^ seed) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
  x = (x ^ (x >>> 16)) >>> 0;
  return x / 0x100000000;
}

function keepSampledFace(sequence, probability) {
  return probability >= 1 || hashToUnit(randomSeed, sequence) < probability;
}

function faceInsideCrop(input, header, vertexLayout, vertexStart, transform, a, b, c) {
  const centroid = [a, b, c].reduce((sum, sourceIndex) => {
    const offset = vertexStart + sourceIndex * vertexLayout.stride;
    return sum + readScalar(input, offset, header.vertex, vertexLayout, "x");
  }, 0) / 3;
  if (centroid < transform.cropBounds.minX || centroid > transform.cropBounds.maxX) return false;

  const centroidZ = [a, b, c].reduce((sum, sourceIndex) => {
    const offset = vertexStart + sourceIndex * vertexLayout.stride;
    return sum + readScalar(input, offset, header.vertex, vertexLayout, "z");
  }, 0) / 3;
  return centroidZ >= transform.cropBounds.minZ && centroidZ <= transform.cropBounds.maxZ;
}

async function writeChunk(input, header, vertexLayout, transform, outputPath, chunk) {
  const orderedVertices = [...chunk.used].sort((a, b) => a - b);
  const remap = new Map(orderedVertices.map((sourceIndex, outputIndex) => [sourceIndex, outputIndex]));
  const vertexStart = header.bodyOffset;
  const faceCount = chunk.faces.length / 3;
  const outputHeader = Buffer.from(
    [
      "ply",
      "format binary_little_endian 1.0",
      "comment TriSplat web mesh chunk",
      "comment perimeter-cropped and deterministically random-sampled for web delivery",
      "comment web runtime applies Y-up axis alignment",
      "comment generated by scripts/build-web-meshes.mjs",
      `element vertex ${orderedVertices.length}`,
      "property float x",
      "property float y",
      "property float z",
      "property uchar red",
      "property uchar green",
      "property uchar blue",
      `element face ${faceCount}`,
      "property list uchar uint vertex_indices",
      "end_header",
      "",
    ].join("\n"),
  );
  const output = Buffer.alloc(outputHeader.length + orderedVertices.length * 15 + faceCount * 13);
  outputHeader.copy(output, 0);

  let writeOffset = outputHeader.length;
  for (const sourceIndex of orderedVertices) {
    const vertex = readTransformedVertex(input, header, vertexLayout, vertexStart, sourceIndex, transform);
    output.writeFloatLE(vertex.x, writeOffset);
    output.writeFloatLE(vertex.y, writeOffset + 4);
    output.writeFloatLE(vertex.z, writeOffset + 8);
    output.writeUInt8(vertex.red, writeOffset + 12);
    output.writeUInt8(vertex.green, writeOffset + 13);
    output.writeUInt8(vertex.blue, writeOffset + 14);
    writeOffset += 15;
  }

  for (let index = 0; index < chunk.faces.length; index += 3) {
    output.writeUInt8(3, writeOffset);
    output.writeUInt32LE(remap.get(chunk.faces[index]), writeOffset + 1);
    output.writeUInt32LE(remap.get(chunk.faces[index + 1]), writeOffset + 5);
    output.writeUInt32LE(remap.get(chunk.faces[index + 2]), writeOffset + 9);
    writeOffset += 13;
  }

  const compressed = gzipSync(output, gzipOptions);
  if (compressed.byteLength > githubFileLimitBytes) {
    throw new Error(`${path.basename(outputPath)} would exceed the GitHub file-size guard after gzip`);
  }

  await writeFile(outputPath, compressed);
  return {
    file: path.relative(process.cwd(), outputPath),
    vertices: orderedVertices.length,
    faces: faceCount,
    rawSizeMb: Number((output.byteLength / 1024 / 1024).toFixed(2)),
    gzipSizeMb: Number((compressed.byteLength / 1024 / 1024).toFixed(2)),
  };
}

function isGeneratedOutputName(name, outputBaseName) {
  return (
    name === `${outputBaseName}.ply` ||
    name === `${outputBaseName}.ply.gz` ||
    (name.startsWith(`${outputBaseName}.part`) && (name.endsWith(".ply") || name.endsWith(".ply.gz")))
  );
}

async function convertMesh(inputPath, outputBasePath) {
  const input = await readFile(inputPath);
  const header = parseHeader(input, inputPath);
  if (!header.vertex || !header.face) throw new Error(`Missing vertex or face element in ${inputPath}`);

  const vertexLayout = elementLayout(header.vertex);
  if (!vertexLayout) throw new Error(`Unsupported vertex list property in ${inputPath}`);

  const vertexStart = header.bodyOffset;
  const faceStart = vertexStart + header.vertex.count * vertexLayout.stride;
  const transform = computeVertexTransform(input, header, vertexLayout);
  const sampleProbability = Math.min(1, maxWebFaces / Math.max(header.face.count, 1));
  let cursor = faceStart;
  let skippedFaces = 0;
  let croppedFaces = 0;
  let sampledFaces = 0;
  let candidateFaces = 0;
  const chunks = [];
  let currentChunk = createChunk(`${path.basename(outputBasePath, ".ply")}.part001.ply`);

  for (let faceIndex = 0; faceIndex < header.face.count; faceIndex += 1) {
    const face = readFace(input, cursor, header.face);
    cursor = face.nextOffset;

    if (!face.indices || face.indices.length < 3) {
      skippedFaces += 1;
      continue;
    }

    for (let index = 1; index < face.indices.length - 1; index += 1) {
      const a = face.indices[0];
      const b = face.indices[index];
      const c = face.indices[index + 1];
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
        transform.finite[a] &&
        transform.finite[b] &&
        transform.finite[c];
      if (!validFace) {
        skippedFaces += 1;
        continue;
      }
      if (!faceInsideCrop(input, header, vertexLayout, vertexStart, transform, a, b, c)) {
        croppedFaces += 1;
        continue;
      }
      candidateFaces += 1;
      if (!keepSampledFace(candidateFaces, sampleProbability)) {
        sampledFaces += 1;
        continue;
      }
      appendFaceToChunk(currentChunk, a, b, c);
      if (estimatedChunkBytes(currentChunk) > githubFileLimitBytes * 0.92) {
        chunks.push(currentChunk);
        currentChunk = createChunk(`${path.basename(outputBasePath, ".ply")}.part${String(chunks.length + 1).padStart(3, "0")}.ply`);
      }
    }
  }

  if (currentChunk.faces.length) chunks.push(currentChunk);
  const outputDir = path.dirname(outputBasePath);
  await mkdir(outputDir, { recursive: true });
  const outputBaseName = path.basename(outputBasePath, ".ply");
  for (const entry of await readdir(outputDir, { withFileTypes: true })) {
    if (isGeneratedOutputName(entry.name, outputBaseName)) {
      await rm(path.join(outputDir, entry.name), { force: true });
    }
  }
  await rm(outputBasePath, { force: true });
  const outputFiles = [];

  for (const [index, chunk] of chunks.entries()) {
    const chunkPath = chunks.length === 1
      ? `${outputBasePath}.gz`
      : path.join(outputDir, `${outputBaseName}.part${String(index + 1).padStart(3, "0")}.ply.gz`);
    outputFiles.push(await writeChunk(input, header, vertexLayout, transform, chunkPath, chunk));
  }

  return {
    input: path.relative(process.cwd(), inputPath),
    sourceVertices: header.vertex.count,
    sourceFaces: header.face.count,
    finiteVertices: transform.finiteCount,
    croppedVerticesForBounds: transform.croppedVertexCount,
    outputFiles,
    outputFaces: outputFiles.reduce((sum, file) => sum + file.faces, 0),
    skippedFaces,
    croppedFaces,
    sampledFaces,
    candidateFaces,
    cropQuantile: perimeterCropQuantile,
    sampleProbability: Number(sampleProbability.toFixed(6)),
    randomSeed,
    scale: Number(transform.scale.toFixed(6)),
  };
}

async function convertTree(sourceDir, outputDir) {
  await mkdir(outputDir, { recursive: true });
  const entries = await readdir(sourceDir, { withFileTypes: true });
  const reports = [];

  for (const entry of entries) {
    const sourcePath = path.join(sourceDir, entry.name);
    const outputPath = path.join(outputDir, entry.name);

    if (entry.isDirectory()) {
      reports.push(...await convertTree(sourcePath, outputPath));
      continue;
    }

    if (!entry.name.endsWith(".ply")) continue;
    console.log(`Building ${sourcePath}`);
    reports.push(await convertMesh(sourcePath, outputPath));
  }

  return reports;
}

const reports = await convertTree(sourceRoot, outputRoot);
console.log(JSON.stringify(reports, null, 2));
